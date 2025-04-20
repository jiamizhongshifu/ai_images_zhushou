// ... existing code ...
                    src={getImageUrl(image.imageUrl)}
                    alt={`历史图片 ${index + 1}`}
                    onImageLoad={() => handleImageLoad(image)}
                    onImageError={() => handleImageError(image)}
                    className="w-full h-full object-contain bg-muted/20"
                    fadeIn={true}
// ... existing code ...