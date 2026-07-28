using System.Drawing;
using System.Drawing.Imaging;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using OpenCvSharp;

namespace Warden.Core.Services;

public class CaptureService
{
    private const int SRCCOPY = 0x00CC0020;
    private const int CAPTUREBLT = 0x40000000;

    private static readonly HttpClient UploadClient = new()
    {
        Timeout = TimeSpan.FromSeconds(15)
    };

    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDc);

    [DllImport("gdi32.dll")]
    private static extern bool BitBlt(
        IntPtr hdcDest,
        int xDest,
        int yDest,
        int width,
        int height,
        IntPtr hdcSrc,
        int xSrc,
        int ySrc,
        int rop
    );

    public static byte[]? CaptureScreen()
    {
        try
        {
            var screens = System.Windows.Forms.Screen.AllScreens;
            if (screens.Length == 0)
            {
                return null;
            }

            var left = screens.Min(s => s.Bounds.Left);
            var top = screens.Min(s => s.Bounds.Top);
            var right = screens.Max(s => s.Bounds.Right);
            var bottom = screens.Max(s => s.Bounds.Bottom);
            var width = right - left;
            var height = bottom - top;

            if (width <= 0 || height <= 0)
            {
                return null;
            }

            using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
            var captured = TryBitBltCapture(bitmap, left, top, width, height);
            if (!captured)
            {
                using var graphics = Graphics.FromImage(bitmap);
                graphics.Clear(Color.Black);
                foreach (var screen in screens)
                {
                    var bounds = screen.Bounds;
                    graphics.CopyFromScreen(
                        bounds.Left,
                        bounds.Top,
                        bounds.Left - left,
                        bounds.Top - top,
                        bounds.Size,
                        CopyPixelOperation.SourceCopy
                    );
                }
            }

            return EncodeJpeg(bitmap);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Grabs a single JPEG frame from the default webcam (index 0).
    /// Returns null if no camera is available or a usable frame cannot be read.
    /// </summary>
    public static byte[]? CaptureWebcam()
    {
        try
        {
            using var capture = new VideoCapture(0, VideoCaptureAPIs.DSHOW);
            if (!capture.IsOpened())
            {
                capture.Open(0);
            }

            if (!capture.IsOpened())
            {
                return null;
            }

            capture.Set(VideoCaptureProperties.BufferSize, 1);

            using var frame = new Mat();
            // Discard a few frames so exposure/auto-focus can settle.
            for (var i = 0; i < 8; i++)
            {
                if (!capture.Read(frame) || frame.Empty())
                {
                    Thread.Sleep(40);
                }
            }

            if (!capture.Read(frame) || frame.Empty())
            {
                return null;
            }

            Cv2.ImEncode(".jpg", frame, out var bytes, new ImageEncodingParam(ImwriteFlags.JpegQuality, 85));
            return bytes is { Length: > 1024 } ? bytes : null;
        }
        catch
        {
            return null;
        }
    }

    private static byte[]? EncodeJpeg(Bitmap bitmap)
    {
        using var stream = new MemoryStream();
        var encoder = ImageCodecInfo
            .GetImageEncoders()
            .FirstOrDefault(codec => codec.FormatID == ImageFormat.Jpeg.Guid);

        if (encoder != null)
        {
            using var encoderParams = new EncoderParameters(1);
            encoderParams.Param[0] = new EncoderParameter(Encoder.Quality, 85L);
            bitmap.Save(stream, encoder, encoderParams);
        }
        else
        {
            bitmap.Save(stream, ImageFormat.Jpeg);
        }

        var bytes = stream.ToArray();
        return bytes.Length > 1024 ? bytes : null;
    }

    private static bool TryBitBltCapture(Bitmap bitmap, int left, int top, int width, int height)
    {
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.Black);
        var hdcDest = graphics.GetHdc();
        var hdcSrc = GetDC(IntPtr.Zero);

        try
        {
            return BitBlt(
                hdcDest,
                0,
                0,
                width,
                height,
                hdcSrc,
                left,
                top,
                SRCCOPY | CAPTUREBLT
            );
        }
        finally
        {
            graphics.ReleaseHdc(hdcDest);
            ReleaseDC(IntPtr.Zero, hdcSrc);
        }
    }

    public static async Task<(bool ok, string? error)> UploadCaptureAsync(
        string uploadUrl,
        byte[] imageData,
        string? token = null
    )
    {
        try
        {
            using var content = new ByteArrayContent(imageData);
            content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");

            using var request = new HttpRequestMessage(HttpMethod.Put, uploadUrl)
            {
                Content = content
            };
            request.Headers.TryAddWithoutValidation("x-upsert", "true");
            if (!string.IsNullOrWhiteSpace(token))
            {
                request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");
            }

            var response = await UploadClient.SendAsync(request).ConfigureAwait(false);
            if (response.IsSuccessStatusCode)
            {
                return (true, null);
            }

            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return (
                false,
                $"Upload failed ({(int)response.StatusCode}): {Truncate(body, 200)}"
            );
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max];
}
