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
      name: 'Rectangle',
      emoji: '🧱',
      description: 'A flat rectangular slab — two stacked layers folded back on themselves.',
      closing: 'Close the two ends together — they lock into a flat rectangular slab.',
      // Pattern: L L L L R L L L L L S R repeating, truncated to 23 joints.
      // Traces a 12-segment loop in one layer, then a mirrored 12-segment
      // loop directly behind it — two flat layers, not a climbing staircase.
      joints: [
        'L','L','L','L','R','L','L','L','L','L','S','R',
        'L','L','L','L','R','L','L','L','L','L','S',
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
