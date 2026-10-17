#!/usr/bin/env python3
"""把 common/family.js（兩個遊戲共用的程式）嵌進 TARGETS 的每個 HTML。

嵌入位置是 <!-- FAMILY:START --> ～ <!-- FAMILY:END --> 之間（整段換新）；
第一次執行時放在遊戲主程式的第一個 <script> 前面。每個 HTML 仍然是單檔、可以離線開。

用法：
  python3 tools/build_common.py

改了 common/family.js 一定要重新執行，並把重新嵌入的 HTML 一起 commit。
建置順序：先 build_common.py，再 build_zhuyin.py。
family.js 用 LF 存；嵌入時換成目標 HTML 的換行（CRLF），檔尾有沒有換行維持原狀。
"""
import os
import re

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
SOURCE = os.path.join(ROOT, 'common', 'family.js')
TARGETS = ['logic_game.html', 'montessori_math_game.html']
START, END = '<!-- FAMILY:START', '<!-- FAMILY:END -->'


def main():
    js = open(SOURCE, encoding='utf8', newline='').read().replace('\r\n', '\n')
    if not js.endswith('\n'):
        js += '\n'
    body = ''.join(('    ' + line if line else '') + '\n' for line in js.split('\n')[:-1])
    block = (f'{START}（由 tools/build_common.py 產生，請勿手動修改；原始碼：common/family.js） -->\n'
             f'  <script>\n{body}  </script>\n  {END}\n')

    for name in TARGETS:
        path = os.path.join(ROOT, name)
        with open(path, encoding='utf8', newline='') as f:
            html = f.read()
        nl = '\r\n' if '\r\n' in html else '\n'
        html = html.replace('\r\n', '\n')
        if START in html:
            html, n = re.subn(r'[ \t]*' + re.escape(START) + r'.*?' + re.escape(END) + r'\n?',
                              lambda m: '  ' + block, html, flags=re.S)
            assert n == 1, f'{name}: 找不到完整的共用程式區塊（{START} … {END}）'
        else:
            m = re.search(r'^[ \t]*<script>\n', html, flags=re.M)
            assert m, f'{name}: 找不到 <script>'
            html = html[:m.start()] + '  ' + block + '\n' + html[m.start():]
        with open(path, 'w', encoding='utf8', newline='') as f:
            f.write(html.replace('\n', nl))
        print(f'{name}: 已嵌入 common/family.js')


if __name__ == '__main__':
    main()
