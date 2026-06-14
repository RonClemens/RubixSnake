// shapes.js — preset shape library
// joints: array of 23 S/R/L strings describing each joint from straight

var Shapes = (function () {

  var library = [
    {
      id: 'cube',
      name: 'Cube',
      emoji: '🎲',
      description: 'Classic 2×2×2 cube — the most iconic Rubik\'s Snake shape.',
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
      name: 'Rectangle',
      emoji: '🧱',
      description: 'A flat rectangular slab — repeats Straight-Straight-Straight, Right-Right-Right.',
      // Pattern: S S S R R R repeating × 4, minus the last R (23 joints total)
      joints: [
        'S','S','S','R','R','R',
        'S','S','S','R','R','R',
        'S','S','S','R','R','R',
        'S','S','S','R','R',
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
