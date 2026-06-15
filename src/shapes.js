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
      description: 'A flat, symmetric rectangular frame — a hollow loop with an open center, like a picture frame.',
      closing: 'Close the two ends together — they lock into a flat rectangular frame with an open center.',
      // Pattern: three 180° "flip" joints (F), each a clean 90° corner that
      // stays perfectly flat (unlike R/L pairs, which tilt out of plane).
      // Runs of 6, 4, 6, 4 straight segments between the corners give four
      // legs of 7, 5, 7, 5 segments — a symmetric rectangle (opposite sides
      // equal) with no overlaps. The 4th corner needs no joint: the chain's
      // built-in alternation makes it turn 90° on its own, landing segment 23
      // back next to segment 0 to close the loop.
      joints: [
        'S','S','S','S','S','S','F','S','S','S','S','F',
        'S','S','S','S','S','S','F','S','S','S','S',
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
