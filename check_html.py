#!/usr/bin/env python3
# check_html.py — 驗證 HTML 標籤配對是否平衡（開/關標籤一一對應，無孤兒收尾標籤）。
# 由 check.sh 呼叫，鎖定 Index.html/Style.html 這類「非 Script*.html」檔——
# 那些檔案沒有單一 <script> 包裹可以剝殼驗證 JS 語法，過去只能肉眼看，
# 漏刪一個開頭 <div> 卻沒同步刪對應收尾 </div> 這種 bug 會直接讓整頁 UI 崩壞、
# 但 GAS 部署仍然綠燈（.html 從不被任何 CI 檢查），只能靠這隻腳本在本地攔下。
import sys
from html.parser import HTMLParser

VOID = {'br', 'img', 'input', 'hr', 'meta', 'link', 'col', 'area', 'base', 'embed', 'source', 'track', 'wbr'}


class BalanceChecker(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if not self.stack:
            self.errors.append(f"多餘的收尾標籤 </{tag}> 於 {self.getpos()}（前面沒有對應的開頭標籤）")
            return
        top_tag, top_pos = self.stack[-1]
        if top_tag == tag:
            self.stack.pop()
            return
        # 找不到緊鄰配對，往下找同名標籤（容忍中間其他標籤已用其他方式配對錯開）
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                unclosed = self.stack[i + 1:]
                for u_tag, u_pos in unclosed:
                    self.errors.append(f"<{u_tag}>（開於 {u_pos}）從未被關閉，就被外層的 </{tag}> 提前收尾")
                del self.stack[i:]
                return
        self.errors.append(f"</{tag}> 於 {self.getpos()} 找不到任何對應的開頭標籤")


def check_file(path):
    with open(path, encoding='utf-8') as f:
        content = f.read()
    c = BalanceChecker()
    c.feed(content)
    for tag, pos in c.stack:
        c.errors.append(f"<{tag}>（開於 {pos}）到檔案結尾都沒有被關閉")
    return c.errors


if __name__ == '__main__':
    overall_fail = False
    for path in sys.argv[1:]:
        errors = check_file(path)
        if errors:
            overall_fail = True
            print(f"FAIL {path}")
            for e in errors:
                print(f"  - {e}")
        else:
            print(f"OK   {path}（標籤配對）")
    sys.exit(1 if overall_fail else 0)
