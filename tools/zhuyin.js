    /* 自動注音：把畫面上每個中文字包成「字＋右側注音」，之後動態加入的文字也會自動補上。
       不想加注音的區塊可以加上 data-no-zhuyin 屬性。 */
    (function () {
      const DATA = __ZHUYIN_DATA__;
      const CHARS = {};
      DATA.chars.replace(/([㐀-䶿一-鿿])([^㐀-䶿一-鿿]+)/g, (m, c, z) => { CHARS[c] = z; });
      const WORDS = DATA.words;
      const MAX_WORD = Math.max(1, ...Object.keys(WORDS).map(w => w.length));
      const HAN = /[㐀-䶿一-鿿]/;
      const CLOSE = /^[，。、！？；：」』）》〉…—～,.!?;:)\]]+/;
      const OPEN = /[「『（《〈(\[]+$/;
      const SKIP = '.zy-w, [data-no-zhuyin], script, style, textarea, input, select, option, title, svg, canvas, code, pre, [contenteditable]';

      // 先比對破音詞（取最長），其餘用單字的常用讀音
      function readings(text) {
        const out = [];
        for (let i = 0; i < text.length;) {
          let hit = null;
          for (let n = Math.min(MAX_WORD, text.length - i); n >= 2 && !hit; n--) {
            const w = WORDS[text.substr(i, n)];
            if (w) hit = w.split(' ');
          }
          if (hit) { out.push(...hit); i += hit.length; }
          else { out.push(CHARS[text[i]] || null); i++; }
        }
        return out;
      }

      function unit(ch, raw) {
        const u = document.createElement('span');
        u.className = 'zy-u';
        const z = document.createElement('span');
        z.className = 'zy';
        z.setAttribute('aria-hidden', 'true');
        let tone = raw.match(/[ˊˇˋ˙]/);
        tone = tone ? tone[0] : '';
        z.dataset.zy = raw.replace(/[ˊˇˋ˙]/g, '').split('').join('\n');
        if (tone) {
          z.dataset.tone = tone;
          z.classList.add(tone === '˙' ? 'zy-n' : 'zy-t');
        }
        u.append(ch, z);
        return u;
      }

      function annotateText(node) {
        const text = node.nodeValue;
        if (!HAN.test(text)) return;
        const parent = node.parentElement;
        if (!parent || parent.closest(SKIP)) return;
        const r = readings(text);
        // 整段包成一個 inline 元素，在 flex 容器裡仍是一個項目（不會被 gap 拆開）
        const wrap = document.createElement('span');
        wrap.className = 'zy-w';
        let plain = '';
        let last = null;
        // 句尾標點黏在前一個字上、開頭的括號黏在後一個字上，避免換行後標點落單
        const flush = next => {
          const c = last && plain.match(CLOSE);
          if (c) { last.append(c[0]); plain = plain.slice(c[0].length); }
          const o = next && plain.match(OPEN);
          if (o) { next.prepend(o[0]); plain = plain.slice(0, -o[0].length); }
          if (plain) { wrap.append(plain); plain = ''; }
        };
        for (let i = 0; i < text.length; i++) {
          if (r[i]) {
            const u = unit(text[i], r[i]);
            flush(u);
            last = u;
            wrap.append(last);
          } else {
            plain += text[i];
          }
        }
        flush();
        // 很短的標籤（例如「1 號房」「資優特訓」）不要從中間斷行
        if (r.filter(Boolean).length <= 6) wrap.style.whiteSpace = 'nowrap';
        node.replaceWith(wrap);
      }

      function annotate(root) {
        if (root.nodeType === Node.TEXT_NODE) return annotateText(root);
        if (root.nodeType !== Node.ELEMENT_NODE || root.closest(SKIP)) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(annotateText);
      }

      annotate(document.body);
      new MutationObserver(list => {
        for (const m of list) {
          if (m.type === 'characterData') annotate(m.target);
          else m.addedNodes.forEach(n => n.isConnected && annotate(n));
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    })();
