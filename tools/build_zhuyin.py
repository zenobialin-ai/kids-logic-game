#!/usr/bin/env python3
"""幫網頁加上自動注音：把 tools/zhuyin.css、tools/zhuyin.js 與注音資料嵌進 TARGETS 的每個 HTML。

注音資料只收該頁用到的字：每個字的常用讀音，以及會改變讀音的詞（破音字，例如「銀行」的行）。
讀音以教育部《重編國語辭典修訂本》為準（臺灣標準讀音，一、不標本調）；
同一個字或詞有多個讀音時，挑和 pypinyin 常用讀音最接近的那個。

用法：
  pip install pypinyin
  git clone --depth 1 https://github.com/g0v/moedict-data.git /tmp/moedict-data
  xz -dk /tmp/moedict-data/dict-revised.json.xz
  python3 tools/build_zhuyin.py /tmp/moedict-data/dict-revised.json

新增或修改畫面文字後重新執行即可（嵌入的區塊會整段換新）。
讀錯的字或詞加到 MANUAL；斷詞斷錯的詞加到 BLOCK。
"""
import json
import os
import re
import sys

from pypinyin import Style, pinyin

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
TARGETS = ['index.html', 'logic_game.html']  # montessori_math_game.html 有自己的注音
HAN = '[\u3400-\u4dbf\u4e00-\u9fff]'
MAX_WORD = 6
START, END = '<!-- ZHUYIN:START', '<!-- ZHUYIN:END -->'

# 人工校正：單字的預設讀音，或詞語（以空白分隔每個字的注音）
MANUAL = {
    '一': 'ㄧ',
    '不': 'ㄅㄨˋ',
    '期': 'ㄑㄧˊ',
    '檔': 'ㄉㄤˇ',
    '質': 'ㄓˊ',
    '誰': 'ㄕㄟˊ',
    '熟': 'ㄕㄡˊ',
    '它': 'ㄊㄚ',
    '著': '˙ㄓㄜ',
    '得': '˙ㄉㄜ',
    '轉': 'ㄓㄨㄢˋ',  # 題目裡多半是齒輪、水管的「轉動」；轉彎、轉換由辭典的詞修正
    '差': 'ㄔㄚ',
    '子': '˙ㄗ',  # 畫面上都是籃子、房子、孩子這類詞尾
    '東西': 'ㄉㄨㄥ ˙ㄒㄧ',
    '數一數': 'ㄕㄨˇ ㄧ ㄕㄨˇ',
    '再數': 'ㄗㄞˋ ㄕㄨˇ',
    '奪得': 'ㄉㄨㄛˊ ㄉㄜˊ',
    '空著': 'ㄎㄨㄥˋ ˙ㄓㄜ',
    '調整為': 'ㄊㄧㄠˊ ㄓㄥˇ ㄨㄟˊ',
    '切換為': 'ㄑㄧㄝ ㄏㄨㄢˋ ㄨㄟˊ',
}

# 前向最長比對會跨過詞的邊界（例如「畫面中的時間」被切出「中的」），這些詞不採用
BLOCK = {
    '的是', '的當', '中的', '中看', '都會', '著數', '它們', '玩法', '數珠', '法子', '比比', '在行',
}


def norm(s):
    """pypinyin 把輕聲 ˙ 放在後面，教育部放在前面；統一成前面。"""
    s = s.strip()
    if s.endswith('˙'):
        s = '˙' + s[:-1]
    return s


def clean_moe(b):
    # 去掉「（變）」「（又音）」等附註，只留第一組讀音
    b = re.split(r'[（(]', b)[0]
    return b.replace('\u3000', ' ').split()


def py_reading(text):
    return [norm(x[0]) for x in pinyin(text, style=Style.BOPOMOFO, errors=lambda c: ['?'] * len(c))]


def base(s):
    return s.lstrip('˙').rstrip('ˊˇˋ')


def pick(candidates, prefer):
    """從教育部的多個讀音中挑出和 pypinyin 最接近的。"""
    def score(c):
        exact = sum(a == b for a, b in zip(c, prefer))
        loose = sum(base(a) == base(b) for a, b in zip(c, prefer))
        return (exact, loose)
    return max(candidates, key=score)


def load_moe(path):
    moe = {}
    for e in json.load(open(path, encoding='utf8')):
        t = e['title']
        if not re.fullmatch(HAN + '+', t):
            continue
        for h in e.get('heteronyms', []):
            if 'bopomofo' in h:
                syl = clean_moe(h['bopomofo'])
                if len(syl) == len(t):
                    moe.setdefault(t, []).append(syl)
    return moe


def visible_text(html):
    """去掉已嵌入的注音區塊與註解，只留可能顯示在畫面上的文字。"""
    html = re.sub(re.escape(START) + r'.*?' + re.escape(END), '', html, flags=re.S)
    html = re.sub(r'<!--.*?-->|/\*.*?\*/', '', html, flags=re.S)
    return re.sub(r'(?<![:\'"\\])//[^\n]*', '', html)


def build_data(text, moe, review):
    runs = re.findall(HAN + '+', text)
    chars = sorted(set(''.join(runs)))

    char_map = {}
    for c in chars:
        prefer = py_reading(c)
        if c in MANUAL:
            char_map[c] = MANUAL[c]
        elif c in moe:
            got = pick(moe[c], prefer)
            char_map[c] = got[0]
        elif prefer[0] != '?':
            char_map[c] = prefer[0]
            review.add(f'{c}: 教育部辭典沒有，用 pypinyin {prefer[0]}')
        else:
            review.add(f'{c}: 找不到讀音，不加注音')

    words = {}
    for run in runs:
        prefer = py_reading(run)
        i = 0
        while i < len(run):
            for n in range(min(MAX_WORD, len(run) - i), 1, -1):
                w = run[i:i + n]
                if w in MANUAL:
                    reading = MANUAL[w].split()
                elif w in moe and w not in BLOCK:
                    reading = pick(moe[w], prefer[i:i + n])
                else:
                    continue
                if any(r != char_map.get(c) for r, c in zip(reading, w)):
                    words[w] = ' '.join(reading)
                i += n
                break
            else:
                i += 1

    return {
        'chars': ''.join(c + char_map[c] for c in chars if c in char_map),
        'words': dict(sorted(words.items())),
    }


def main(moe_path):
    moe = load_moe(moe_path)
    css = open(os.path.join(TOOLS, 'zhuyin.css'), encoding='utf8').read()
    js = open(os.path.join(TOOLS, 'zhuyin.js'), encoding='utf8').read()
    review = set()

    for name in TARGETS:
        path = os.path.join(ROOT, name)
        with open(path, encoding='utf8', newline='') as f:
            html = f.read()
        nl = '\r\n' if '\r\n' in html else '\n'
        html = html.replace('\r\n', '\n')
        data = build_data(visible_text(html), moe, review)
        block = (f'{START}（由 tools/build_zhuyin.py 產生，請勿手動修改；讀音來源：教育部《重編國語辭典修訂本》） -->\n'
                 f'  <style>\n{css}  </style>\n'
                 f'  <script>\n'
                 + js.replace('__ZHUYIN_DATA__', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
                 + f'  </script>\n  {END}\n')
        if START in html:
            html = re.sub(r'[ \t]*' + re.escape(START) + r'.*?' + re.escape(END) + r'\n',
                          lambda m: '  ' + block, html, flags=re.S)
        else:
            html = html.replace('</body>', '  ' + block + '</body>', 1)
        with open(path, 'w', encoding='utf8', newline='') as f:
            f.write(html.replace('\n', nl))
        print(f'{name}: {len(re.findall(HAN, data["chars"]))} 字、{len(data["words"])} 個破音詞')

    if review:
        print('\n需要人工確認：')
        print('\n'.join(sorted(review)))


if __name__ == '__main__':
    main(sys.argv[1])
