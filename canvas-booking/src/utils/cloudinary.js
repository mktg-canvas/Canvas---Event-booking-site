const CLOUD_NAME = 'dg24ipzra';

export function cloudinaryUrl(publicId, width, height) {
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/w_${width},h_${height},c_fill,f_auto,q_auto/${publicId}`;
}
