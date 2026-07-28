using System.Drawing;
using System.Drawing.Imaging;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;

namespace Warden.Core.Services;

public class CaptureService
{
    private const int SRCCOPY = 0x00CC0020;
    private const int CAPTUREBLT = 0x40000000;

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
        catch
        {
            return null;
        }
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
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
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

            var response = await client.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                return (true, null);
            }

            var body = await response.Content.ReadAsStringAsync();
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
