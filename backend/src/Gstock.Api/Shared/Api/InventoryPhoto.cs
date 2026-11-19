namespace Gstock.Api.Shared.Api;

internal sealed record SetInventoryPhotoInput(byte[]? ProfilePhoto);

internal static class InventoryPhoto
{
    public static byte[]? Validate(byte[]? photo)
    {
        if (photo is not null && (photo.Length > 1_048_576 || GetContentType(photo) is null))
        {
            throw ApiError.Invalid("profilePhoto", "Supply a PNG or JPEG up to 1 MiB.");
        }
        return photo;
    }

    public static string? GetContentType(ReadOnlySpan<byte> photo)
    {
        if (photo.Length > 8 && photo.StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return "image/png";
        return photo.Length > 3 && photo.StartsWith(new byte[] { 255, 216, 255 }) ? "image/jpeg" : null;
    }

    public static IResult File(byte[]? photo, HttpContext context)
    {
        var type = photo is null ? null : GetContentType(photo);
        if (type is null) throw ApiError.Missing("Picture");
        context.Response.Headers.CacheControl = "private, no-store";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        return Results.File(photo!, type);
    }
}
