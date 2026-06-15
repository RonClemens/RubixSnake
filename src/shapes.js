// shapes.js — preset shape library
// joints: array of 23 S/R/L/F strings describing each joint from straight

var Shapes = (function () {

  var library = [
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
    {
      id: 'slab-2x12',
      name: 'Rectangle Slab (2×12)',
      emoji: '🧱',
      description: 'A flat, solid rectangular slab — no hole in the middle, just one tiled sheet of triangles, 2 cells by 12 cells.',
      closing: 'Close the two ends together — they sit flush, completing a solid 2×12 rectangular tile.',
      // Pattern: S^4 F F S^10 F F S^5 (23 joints). A double-flip "F F" is a
      // net 360° turn, so the strip keeps going straight instead of folding
      // back on itself — the chain lays flat as one continuous row of 24
      // triangles that perfectly tile a 2×12 rectangle (no gaps, no overlap).
      joints: [
        'S','S','S','S','F','F',
        'S','S','S','S','S','S','S','S','S','S',
        'F','F','S','S','S','S','S',
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

  function remove(id) {
    for (var i = 0; i < library.length; i++) {
      if (library[i].id === id) { library.splice(i, 1); return true; }
    }
    return false;
  }

  return { getAll: getAll, getById: getById, add: add, remove: remove };
})();
