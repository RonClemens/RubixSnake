// movesEngine.js — interactive joint editor for building new shapes
// Renders a controls panel where each joint can be set to S / R / L
// with live 2D + 3D preview update.

var MovesEngine = (function () {

  var currentJoints = null;
  var onChangeCb = null;

  var UI = {
    S: { col: '#58a6ff', lbl: 'S', title: 'Straight' },
    R: { col: '#f0883e', lbl: 'R', title: 'Right 90°' },
    L: { col: '#3fb950', lbl: 'L', title: 'Left 90°' },
  };

  function init(container, joints, onChange) {
    currentJoints = joints.slice();
    onChangeCb = onChange;
    render(container);
  }

  function render(container) {
    var h = '<div style="display:flex;flex-direction:column;gap:6px">';
    h += '<div style="font-size:11px;color:#6e7681;margin-bottom:4px">Tap a joint to cycle S → R → L → S</div>';

    // group joints in rows of 6 to match the S R R S L L pattern
    for (var i = 0; i < 23; i++) {
      var t = currentJoints[i];
      var u = UI[t];
      var jnum = i + 1;
      if (i % 6 === 0) {
        if (i > 0) h += '</div>';
        h += '<div style="display:flex;gap:4px;align-items:center">';
        h += '<span style="font-size:9px;color:#484f58;width:18px;text-align:right">' + (Math.floor(i/6)+1) + '</span>';
      }
      h += '<button data-ji="' + i + '" style="' +
        'flex:1;padding:7px 2px;border-radius:7px;font-size:12px;font-weight:800;' +
        'background:' + u.col + '22;border:1.5px solid ' + u.col + ';color:' + u.col + ';' +
        'cursor:pointer;transition:all .15s" title="Joint ' + jnum + ' — ' + u.title + '">' +
        u.lbl + '<br><span style="font-size:8px;font-weight:400;color:#6e7681">' + jnum + '</span>' +
        '</button>';
    }
    h += '</div></div>';

    // export row
    h += '<div style="margin-top:10px;display:flex;gap:8px">';
    h += '<button id="me-copy" style="flex:1;padding:9px;background:#21262d;border:1px solid #30363d;border-radius:8px;color:#c9d1d9;font-size:12px;font-weight:700">&#128203; Copy JSON</button>';
    h += '<button id="me-reset" style="padding:9px 14px;background:#21262d;border:1px solid #30363d;border-radius:8px;color:#6e7681;font-size:12px">&#8634; Reset</button>';
    h += '</div>';

    // current sequence readout
    h += '<div id="me-seq" style="margin-top:8px;font-size:11px;font-family:monospace;color:#58a6ff;background:#0d1117;border:1px solid #21262d;border-radius:7px;padding:8px;line-height:1.8;word-break:break-all">';
    h += formatSeq(currentJoints);
    h += '</div>';

    container.innerHTML = h;

    // wire joint buttons
    container.querySelectorAll('[data-ji]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ji = parseInt(this.getAttribute('data-ji'));
        cycleJoint(ji);
        render(container);
        if (onChangeCb) onChangeCb(currentJoints.slice());
      });
    });

    // copy JSON
    var copyBtn = container.querySelector('#me-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var json = JSON.stringify(currentJoints);
        if (navigator.clipboard) {
          navigator.clipboard.writeText(json).then(function () {
            copyBtn.textContent = '✓ Copied!';
            setTimeout(function () { copyBtn.textContent = '📋 Copy JSON'; }, 1500);
          });
        } else {
          copyBtn.textContent = json;
        }
      });
    }

    // reset
    var resetBtn = container.querySelector('#me-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        currentJoints = Array(23).fill('S');
        render(container);
        if (onChangeCb) onChangeCb(currentJoints.slice());
      });
    }
  }

  function cycleJoint(ji) {
    var seq = ['S', 'R', 'L'];
    var cur = currentJoints[ji];
    var idx = seq.indexOf(cur);
    currentJoints[ji] = seq[(idx + 1) % 3];
  }

  function formatSeq(joints) {
    return joints.map(function (t, i) {
      var u = { S: '#58a6ff', R: '#f0883e', L: '#3fb950' };
      return '<span style="color:' + u[t] + '">' + t + '</span>';
    }).join(' ');
  }

  function getJoints() { return currentJoints ? currentJoints.slice() : null; }

  return { init: init, getJoints: getJoints };
})();
