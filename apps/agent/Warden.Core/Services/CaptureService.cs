using System.Drawing;
using System.Drawing.Imaging;
using System.Net.Http.Headers;
using Warden.Core.Models;

namespace Warden.Core.Services;

public class CaptureService
{
    public static byte[]? CaptureScreen()
    {
        try
        {
            var bounds = System.Windows.Forms.Screen.PrimaryScreen?.Bounds
                         ?? new Rectangle(0, 0, 1920, 1080);

            using var bitmap = new Bitmap(bounds.Width, bounds.Height);
            using var graphics = Graphics.FromImage(bitmap);
            graphics.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);

            using var stream = new MemoryStream();
            bitmap.Save(stream, ImageFormat.Jpeg);
            return stream.ToArray();
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
}
