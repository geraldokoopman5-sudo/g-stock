export const maxPhotoBytes = 1_048_576

export async function readInventoryPhoto(file: File) {
  if (!file.size || file.size > maxPhotoBytes) throw new Error('Choose a PNG or JPEG picture up to 1 MiB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const png = [137, 80, 78, 71, 13, 10, 26, 10]
  const mime = bytes.length > 8 && png.every((value, index) => bytes[index] === value) ? 'image/png'
    : bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' : null
  if (!mime) throw new Error('Choose a PNG or JPEG picture.')
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  const profilePhoto = btoa(binary)
  return { profilePhoto, preview: `data:${mime};base64,${profilePhoto}` }
}
