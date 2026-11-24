"""
端到端煙霧測試（真實 Chromium + 建置後的 App + Web Worker 內的 OpenCV.js）。
前置：npm run build && npx vite preview --port 4173；npm run synth 產生 tests/synthetic/out/*.png
執行：python tests/e2e/e2e_smoke.py
"""
import csv
import io
import pathlib
import sys

from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[2]
SYN = ROOT / "tests" / "synthetic" / "out"
SHOTS = ROOT / "tests" / "e2e" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
KEY = "ABCD" * 5

errors: list[str] = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, accept_downloads=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)

    page.goto(BASE + "#/exams")
    page.get_by_placeholder("例：八年級").fill("E2E 測試考試")
    page.get_by_role("button", name="20 題").click()
    page.get_by_role("button", name="建立並設定答案").click()
    page.wait_for_url("**/#/exams/*")
    page.locator("input[type=text]").nth(1).fill(KEY)
    expect(page.get_by_text("已設定 20 / 20 題")).to_be_visible()
    page.get_by_role("button", name="儲存", exact=True).click()
    expect(page.get_by_text("已儲存")).to_be_visible()
    exam_id = page.url.split("/")[-1]

    page.goto(BASE + f"#/sheet/{exam_id}")
    expect(page.locator(".sheet-preview svg")).to_be_visible()
    page.screenshot(path=str(SHOTS / "sheet.png"), full_page=True)

    # 辨識模組就緒
    page.goto(BASE + "#/")
    expect(page.get_by_text("辨識模組就緒")).to_be_visible(timeout=60000)

    page.goto(BASE + "#/scan")
    page.locator("input[type=file][multiple]").set_input_files([str(SYN / "tilted.png"), str(SYN / "upside.png")])
    try:
        expect(page.get_by_text("逐題結果")).to_be_visible(timeout=60000)
    except AssertionError:
        page.screenshot(path=str(SHOTS / "_fail.png"), full_page=True)
        print(page.locator("main").inner_text()[:600])
        raise
    score = page.locator(".score-big").inner_text()
    assert score.startswith("100"), f"第一張分數應為 100，實得 {score!r}"
    # 合成卡的識別碼（4321）與新建考試不同 → 必須出現警告
    expect(page.get_by_text("識別碼 4321 與目前考試")).to_be_visible()
    page.screenshot(path=str(SHOTS / "result_mobile.png"), full_page=True)

    # 人工修正：把第 1 題改成 B → 分數下降 5
    page.get_by_role("button", name="第1題改為B").click()
    assert page.locator(".score-big").inner_text().startswith("95"), "修正後分數應為 95"
    page.get_by_role("button", name="儲存並掃下一張").click()

    expect(page.get_by_text("已儲存 座號 17：95 分")).to_be_visible()

    # 第二張（倒放）：座號同為 17 → 必須跳出重複警告
    expect(page.locator(".score-big")).to_have_text("100 / 100", timeout=60000)
    page.get_by_role("button", name="儲存並掃下一張").click()
    expect(page.get_by_text("座號 17 已經有一筆紀錄")).to_be_visible()
    page.screenshot(path=str(SHOTS / "duplicate_warning.png"), full_page=True)
    page.get_by_role("button", name="取代舊紀錄").click()
    expect(page.get_by_text("已儲存 座號 17：100 分")).to_be_visible()

    # 成績列表 + CSV
    page.goto(BASE + f"#/results/{exam_id}")
    expect(page.locator("table.list tbody tr")).to_have_count(1)
    with page.expect_download() as dl:
        page.get_by_role("button", name="⬇ 匯出 CSV").click()
    text = pathlib.Path(dl.value.path()).read_text(encoding="utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0][:3] == ["座號", "姓名", "總分"], rows[0]
    assert rows[1][0] == "標準答案" and "".join(rows[1][11:]) == KEY, rows[1]
    assert rows[2][0] == "17" and rows[2][2] == "100", rows[2]
    page.screenshot(path=str(SHOTS / "results_mobile.png"), full_page=True)

    # 失敗情況：沒有答案卡的圖
    page.goto(BASE + "#/scan")
    page.locator("input[type=file][multiple]").set_input_files(str(ROOT / "tests" / "e2e" / "no_sheet.png"))
    expect(page.get_by_text("重新拍攝")).to_be_visible(timeout=60000)

    # 深色模式 + 桌面版面
    page.set_viewport_size({"width": 1280, "height": 900})
    page.goto(BASE + "#/settings")
    page.get_by_role("button", name="深色").click()
    page.goto(BASE + f"#/results/{exam_id}")
    page.locator("table.list tbody tr").first.click()
    expect(page.get_by_text("逐題結果")).to_be_visible()
    page.screenshot(path=str(SHOTS / "record_desktop_dark.png"), full_page=True)

    browser.close()

real_errors = [e for e in errors if "favicon" not in e]
if real_errors:
    print("瀏覽器錯誤：", *real_errors, sep="\n  ")
    sys.exit(1)
print("E2E 通過")
