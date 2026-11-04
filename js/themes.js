// The 10 boards and 10 piece sets you can pick from.
// Art comes from lichess.org (see CREDITS.md).

export const BOARDS = [
  { id: 'brown', name: 'Classic Brown', file: 'brown.png' },
  { id: 'green', name: 'Tournament Green', file: 'green.png' },
  { id: 'blue', name: 'Ocean Blue', file: 'blue.png' },
  { id: 'purple', name: 'Royal Purple', file: 'purple.png' },
  { id: 'wood', name: 'Wood', file: 'wood.jpg' },
  { id: 'maple', name: 'Maple', file: 'maple.jpg' },
  { id: 'marble', name: 'Marble', file: 'marble.jpg' },
  { id: 'blue-marble', name: 'Blue Marble', file: 'blue-marble.jpg' },
  { id: 'metal', name: 'Metal', file: 'metal.jpg' },
  { id: 'leather', name: 'Leather', file: 'leather.jpg' },
];

export const PIECE_SETS = [
  { id: 'cburnett', name: 'Classic' },
  { id: 'merida', name: 'Merida' },
  { id: 'alpha', name: 'Alpha' },
  { id: 'california', name: 'California' },
  { id: 'staunty', name: 'Staunty' },
  { id: 'cardinal', name: 'Cardinal' },
  { id: 'fantasy', name: 'Fantasy' },
  { id: 'celtic', name: 'Celtic' },
  { id: 'spatial', name: 'Spatial' },
  { id: 'pixel', name: 'Pixel' },
];

export const boardThumb = (b) => `assets/boards/thumbs/${b.id}.jpg`;
export const pieceImg = (setId, code) => `assets/pieces/${setId}/${code}.svg`;
