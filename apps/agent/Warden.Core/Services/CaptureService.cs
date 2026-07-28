using System.Drawing;
using System.Drawing.Imaging;
using System.Net.Http.Headers;

namespace Warden.Core.Services;

public class CaptureService
{
    public static byte[]? CaptureScreen()
    {
        try
        {
            var screens = System.Windows.Forms.Screen.AllScreens;
            if (screens.Length == 0)
            {
                return null;
            }

            // Capture the full virtual desktop (all monitors), not just the primary.
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
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.Clear(Color.Black);

                // Copy each monitor into the virtual canvas. This is more reliable than
                // one big CopyFromScreen across mixed-DPI / multi-monitor layouts.
                foreach (var screen in screens)
                {
                    var bounds = screen.Bounds;
                    using var screenBitmap = new Bitmap(
                        bounds.Width,
                        bounds.Height,
                        PixelFormat.Format32bppArgb
                    );
                    using (var screenGraphics = Graphics.FromImage(screenBitmap))
                    {
                        screenGraphics.CopyFromScreen(
                            bounds.Left,
                            bounds.Top,
                            0,
                            0,
                            bounds.Size,
                            CopyPixelOperation.SourceCopy
                        );
                    }

                    graphics.DrawImage(
                        screenBitmap,
                        bounds.Left - left,
                        bounds.Top - top,
                        bounds.Width,
                        bounds.Height
                    );
                }
            }

            using var stream = new MemoryStream();
            var encoder = GetJpegEncoder();
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
            return bytes.Length > 0 ? bytes : null;
        }
        catch
        {
            return null;
        }
    }

    public static async Task<bool> UploadCaptureAsync(string uploadUrl, byte[] imageData)
    {
        using var client = new HttpClient();
        using var content = new ByteArrayContent(imageData);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");

        var response = await client.PutAsync(uploadUrl, content);
        return response.IsSuccessStatusCode;
    }

    private static ImageCodecInfo? GetJpegEncoder()
    {
        return ImageCodecInfo
            .GetImageEncoders()
            .FirstOrDefault(codec => codec.FormatID == ImageFormat.Jpeg.Guid);
    }
}
