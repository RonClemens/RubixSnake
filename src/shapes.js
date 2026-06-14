// shapes.js — preset shape library
// joints: array of 23 S/R/L strings describing each joint from straight

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
      // Pattern: 7 straight, then LL, 3 straight, then LR, 5 straight,
      // then RR, 2 straight (23 joints, 6 turns total).
      // Traces a flat, hollow rectangular loop (open center) with no
      // segment overlaps — segment 0 sits at one corner of the frame.
      joints: [
        'S','S','S','S','S','S','S','L','L','S','S','S','L','R',
        'S','S','S','S','S','R','R','S','S',
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
