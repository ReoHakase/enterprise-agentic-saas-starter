export const validImageCropSource = new Blob(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">',
    '<rect width="800" height="800" fill="#e5e7eb"/>',
    '<circle cx="400" cy="320" r="180" fill="#737373"/>',
    '<rect x="180" y="520" width="440" height="180" rx="90" fill="#404040"/>',
    "</svg>",
  ],
  { type: "image/svg+xml" }
)

export const invalidImageCropSource = new Blob(["not an image"], {
  type: "image/png",
})
