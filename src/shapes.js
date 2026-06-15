// shapes.js — preset shape library
// joints: array of 23 S/R/L/F strings describing each joint from straight

var Shapes = (function () {

  var library = [
    {
      id: 'cube',
      name: 'Cube',
      emoji: '🎲',
      description: 'Classic 2×2×2 cube — the most iconic Rubik\'s Snake shape.',
      closing: 'Close the two ends together — they lock into a cube.',
      // Pattern: S R R S L L repeating × 4, minus the last L (23 joints total)
      joints: [
        'S','R','R',
        'S','L','L',
        'S','R','R',
        'S','L','L',
        'S','R','R',
        'S','L','L',
        'S','R','R',
        'S','L',
      ],
    },
    {
      id: 'rectangle',
      name: 'Picture Frame',
      emoji: '🖼️',
      description: 'A flat rectangular frame — a hollow loop with an open center, like a picture frame.',
      closing: 'Close the two ends together — they lock into a flat rectangular frame with an open center.',
      // Pattern: four 180° "flip" joints (F), each a clean 90° corner that
      // stays perfectly flat (unlike R/L pairs, which tilt out of plane).
      // Gaps of 6, 4, 4, 3, 2 straight segments between/around the corners
      // trace a flat, hollow rectangular loop with no segment overlaps —
      // segment 0 sits at the top-left corner of the frame.
      joints: [
        'S','S','S','S','S','S','F','S','S','S','S','F',
        'S','S','S','S','F','S','S','S','F','S','S',
      ],
    },
  ];

  function getAll() { return library; }

  function getById(id) {
    for (var i = 0; i < library.length; i++) {
      if (library[i].id === id) return library[i];
    }
    return null;
  }

  function add(shape) {
    library.push(shape);
  }

  return { getAll: getAll, getById: getById, add: add };
})();
