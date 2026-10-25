# File: app.py
import base64
import datetime as dt
import io
import json
import random
import shutil
import sys
import uuid
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st
import streamlit.components.v1 as components
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

st.set_page_config(page_title="イラスト練習ラボ", page_icon="🎨", layout="wide")

IS_BROWSER = sys.platform == "emscripten"
DATA_DIR = Path("/mnt/illust_lab_data") if IS_BROWSER else Path("illust_lab_data")
IMG_DIR = DATA_DIR / "images"
LOG_FILE = DATA_DIR / "logs.json"
ROADMAP_FILE = DATA_DIR / "roadmap.json"
SETTINGS_FILE = DATA_DIR / "settings.json"
IMG_DIR.mkdir(parents=True, exist_ok=True)

CATEGORIES = [
    "線・図形", "パース", "人体・デッサン", "顔・表情", "手・足", "クロッキー",
    "服・シワ", "背景", "色彩", "光と影", "模写", "オリジナル作品",
]

ROADMAP = {
    "STEP1 道具と線に慣れる": [
        "まっすぐな線を100本引く",
        "きれいな円と楕円を描けるようにする",
        "線の強弱（入り抜き）をつけて描く",
        "使うペイントソフトの基本操作（レイヤー・ブラシ・反転）を覚える",
    ],
    "STEP2 形と立体": [
        "立方体・球・円柱を立体的に描く",
        "1点透視で部屋を描く",
        "2点透視で建物を描く",
        "身の回りの物を箱に置き換えて描く",
    ],
    "STEP3 人体の基礎": [
        "頭身と体の比率を覚える",
        "棒人間・マネキンでポーズを描く",
        "30秒〜2分のクロッキーを合計100枚描く",
        "顔のパーツ配置（正面・横・斜め）を練習する",
        "手を20パターン模写する",
    ],
    "STEP4 明暗と色": [
        "球体に光源を設定して陰影をつける",
        "グレー3階調で絵を描く",
        "色相・明度・彩度の違いを説明できる",
        "写真からカラーパレットを作って塗る",
    ],
    "STEP5 作品づくり": [
        "構図（三分割・対角線など）を意識してラフを3案描く",
        "背景込みの1枚絵を完成させる",
        "好きな作家の絵を1枚模写して分析する",
        "SNSやポートフォリオに作品を公開する",
    ],
}

SUBJECTS = [
    "猫", "犬", "鳥", "ドラゴン", "ロボット", "魔法使い", "騎士", "学生",
    "カフェの店員", "宇宙飛行士", "忍者", "パティシエ", "探偵", "妖精", "海賊",
]
ACTIONS = [
    "走っている", "振り返っている", "座って本を読んでいる", "ジャンプしている",
    "眠っている", "料理している", "戦う構えをとっている", "雨宿りしている",
    "手を振っている", "伸びをしている", "何かを見上げている", "荷物を運んでいる",
]
PLACES = [
    "夕暮れの教室", "雨の街角", "森の中", "海辺", "夜の屋上", "古い図書館",
    "未来都市", "花畑", "雪山", "商店街", "駅のホーム", "神社の境内",
]
CONSTRAINTS = {
    "初級": [
        "シルエットだけで描く", "丸・四角・三角の組み合わせで描く", "3色以内で塗る",
        "線画だけでOK", "資料を見ながら描く", "全身を画面に入れる",
    ],
    "中級": [
        "あおり構図で描く", "俯瞰構図で描く", "逆光で描く", "グレー3階調で描く",
        "手を必ず画面に入れる", "動きの線（アクションライン）を先に引く",
    ],
    "上級": [
        "2点透視の背景込みで描く", "表情で感情を伝えることを最優先にする",
        "補色を効果的に使う", "魚眼構図で描く", "物語の一場面として描く",
        "光源を2つ設定する",
    ],
}
TIME_LIMITS = ["5分", "10分", "15分", "30分", "60分"]

DRILLS = [
    ("直線・曲線ドリル", "画面いっぱいに直線を50本、曲線を50本。手首ではなく肘と肩で引く意識で。"),
    ("楕円ドリル", "さまざまな角度の楕円を30個。円柱の上面と底面を想像しながら描く。"),
    ("箱ドリル", "いろいろな角度の箱を20個、パースを意識して描く。"),
    ("マネキンクロッキー", "1ポーズ1分で10ポーズ。細部は描かず、体の流れだけを捉える。"),
    ("手の模写", "自分の手や写真を見て、手を10個描く。まず手のひらを箱として捉える。"),
    ("球体の陰影", "光源を決めて、球体にハイライト・中間色・影・反射光・接地影を描き分ける。"),
    ("明暗模写", "好きな絵や写真をグレー3〜4階調だけで模写する。"),
    ("顔の角度ドリル", "同じキャラの顔を正面・斜め・横・あおり・俯瞰で描く。"),
    ("服のシワ観察", "引っ張られる点を意識して、袖やズボンのシワを5箇所描く。"),
]

SELF_CHECK = [
    ("シルエットだけでポーズや動きが伝わる", "黒く塗りつぶして確認しましょう。伝わらない場合は手足を胴体から離すと改善しやすいです。"),
    ("頭身や体の比率に違和感がない", "頭の大きさを基準に比率を測りましょう。左右反転すると狂いに気づきやすくなります。"),
    ("重心が安定している（または意図的に崩している）", "首の付け根から垂線を下ろし、支えている足との位置関係を確認しましょう。"),
    ("パース（目線の高さ）が統一されている", "アイレベルの線を引いて、人物と背景が同じ視点になっているか確認しましょう。"),
    ("光源の方向が統一されている", "光源を矢印で描き込み、すべての影がその反対側にあるか確認しましょう。"),
    ("明暗のメリハリがある", "グレースケールで確認しましょう。中間の明るさばかりなら、最も暗い部分と明るい部分を作りましょう。"),
    ("色数が整理されている", "メインの色・サブの色・アクセント色の役割を決めると、まとまりやすくなります。"),
    ("線に強弱があり、手前と奥が区別できる", "手前や影側の線を太く、奥や光側の線を細くすると立体感が出ます。"),
    ("一番見せたい場所がはっきりしている", "見せたい場所に明暗差・彩度・描き込みを集中させましょう。"),
    ("画面の余白や構図のバランスがよい", "三分割線を重ねて、主役の配置を確認しましょう。"),
]


def load_json(path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return default
    return default


def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_logs():
    return load_json(LOG_FILE, [])


def save_logs(logs):
    save_json(LOG_FILE, logs)


def load_settings():
    return load_json(SETTINGS_FILE, {"weekly_goal": 300})


def calc_streaks(logs):
    dates = sorted({dt.date.fromisoformat(log["date"]) for log in logs})
    if not dates:
        return 0, 0
    longest = 1
    run = 1
    for i in range(1, len(dates)):
        if (dates[i] - dates[i - 1]).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)
    date_set = set(dates)
    today = dt.date.today()
    cursor = today if today in date_set else today - dt.timedelta(days=1)
    current = 0
    while cursor in date_set:
        current += 1
        cursor -= dt.timedelta(days=1)
    return current, longest


def open_image(uploaded, max_size=1600):
    img = Image.open(uploaded)
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((max_size, max_size))
    return img


def image_to_data_uri(img, max_size=900):
    copy = img.copy()
    copy.thumbnail((max_size, max_size))
    buf = io.BytesIO()
    copy.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def posterize_values(img, levels):
    gray = np.array(img.convert("L"), dtype=np.float32)
    idx = np.clip(np.floor(gray / 256 * levels), 0, levels - 1)
    out = (idx * (255 / (levels - 1))).astype(np.uint8)
    return Image.fromarray(out, mode="L")


def draw_grid(img, divisions, color, diagonal):
    out = img.copy()
    draw = ImageDraw.Draw(out)
    w, h = out.size
    line_w = max(1, min(w, h) // 300)
    for i in range(1, divisions):
        x = w * i / divisions
        y = h * i / divisions
        draw.line([(x, 0), (x, h)], fill=color, width=line_w)
        draw.line([(0, y), (w, y)], fill=color, width=line_w)
    if diagonal:
        draw.line([(0, 0), (w, h)], fill=color, width=line_w)
        draw.line([(w, 0), (0, h)], fill=color, width=line_w)
    return out


def extract_palette(img, n_colors):
    small = img.copy()
    small.thumbnail((300, 300))
    quantized = small.quantize(colors=n_colors)
    palette = quantized.getpalette()
    counts = sorted(quantized.getcolors(), reverse=True)
    total = sum(c for c, _ in counts)
    result = []
    for count, index in counts:
        r, g, b = palette[index * 3: index * 3 + 3]
        result.append(("#{:02X}{:02X}{:02X}".format(r, g, b), count / total))
    return result


def page_dashboard():
    st.title("🎨 ダッシュボード")
    logs = load_logs()
    settings = load_settings()
    current, longest = calc_streaks(logs)
    total_minutes = sum(log["minutes"] for log in logs)

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("連続練習日数", f"{current} 日")
    c2.metric("最長連続記録", f"{longest} 日")
    c3.metric("総練習時間", f"{total_minutes // 60} 時間 {total_minutes % 60} 分")
    c4.metric("練習回数", f"{len(logs)} 回")

    st.subheader("今週の目標")
    goal = st.number_input("1週間の目標（分）", min_value=10, max_value=10000, value=int(settings["weekly_goal"]), step=10)
    if goal != settings["weekly_goal"]:
        settings["weekly_goal"] = int(goal)
        save_json(SETTINGS_FILE, settings)
    week_start = dt.date.today() - dt.timedelta(days=6)
    week_minutes = sum(log["minutes"] for log in logs if dt.date.fromisoformat(log["date"]) >= week_start)
    st.progress(min(1.0, week_minutes / goal), text=f"直近7日間: {week_minutes} / {goal} 分")

    today_seed = random.Random(dt.date.today().toordinal())
    st.subheader("今日のお題")
    st.info(f"{today_seed.choice(PLACES)}で{today_seed.choice(ACTIONS)}{today_seed.choice(SUBJECTS)}（条件: {today_seed.choice(CONSTRAINTS['初級'])}）")
    drill = today_seed.choice(DRILLS)
    st.success(f"今日の基礎ドリル: {drill[0]} — {drill[1]}")

    if not logs:
        st.write("まだ練習記録がありません。「練習ログ」から最初の記録を付けてみましょう。")
        return

    df = pd.DataFrame(logs)
    df["date"] = pd.to_datetime(df["date"])
    days = pd.date_range(end=pd.Timestamp(dt.date.today()), periods=30)
    daily = df.groupby("date")["minutes"].sum().reindex(days, fill_value=0)
    daily.index = daily.index.strftime("%m/%d")

    left, right = st.columns(2)
    with left:
        st.subheader("直近30日の練習時間（分）")
        st.bar_chart(daily)
    with right:
        st.subheader("分野別の練習時間（分）")
        cat = df.explode("categories").groupby("categories")["minutes"].sum().sort_values(ascending=False)
        if cat.empty:
            st.write("分野の記録がありません。")
        else:
            st.bar_chart(cat)
            weak = [c for c in CATEGORIES if c not in cat.index]
            if weak:
                st.caption("まだ練習していない分野: " + "、".join(weak))


def page_prompt():
    st.title("🎲 お題ガチャ")
    level = st.radio("レベル", list(CONSTRAINTS.keys()), horizontal=True)
    if st.button("お題を引く", type="primary"):
        st.session_state["prompt"] = {
            "subject": random.choice(SUBJECTS),
            "action": random.choice(ACTIONS),
            "place": random.choice(PLACES),
            "constraint": random.choice(CONSTRAINTS[level]),
            "time": random.choice(TIME_LIMITS),
        }
    prompt = st.session_state.get("prompt")
    if prompt:
        st.markdown(f"## {prompt['place']}で{prompt['action']}{prompt['subject']}")
        c1, c2 = st.columns(2)
        c1.metric("条件", prompt["constraint"])
        c2.metric("制限時間", prompt["time"])

    st.divider()
    st.subheader("基礎ドリルガチャ")
    if st.button("ドリルを引く"):
        st.session_state["drill"] = random.choice(DRILLS)
    drill = st.session_state.get("drill")
    if drill:
        st.success(f"{drill[0]}: {drill[1]}")

    with st.expander("ドリル一覧"):
        for name, desc in DRILLS:
            st.write(f"・{name}: {desc}")


TIMER_HTML = """
<div style="font-family: sans-serif; text-align: center;">
  <div id="status" style="font-size: 20px; margin-bottom: 4px;"></div>
  <div id="time" style="font-size: 64px; font-weight: bold;"></div>
  <div style="background: #ddd; height: 10px; border-radius: 5px; margin: 8px 0;">
    <div id="bar" style="background: #ff4b4b; height: 10px; width: 0%; border-radius: 5px;"></div>
  </div>
  <div style="margin: 8px 0;">
    <button id="start" style="font-size: 18px; padding: 6px 16px;">スタート</button>
    <button id="pause" style="font-size: 18px; padding: 6px 16px;">一時停止</button>
    <button id="skip" style="font-size: 18px; padding: 6px 16px;">スキップ</button>
    <button id="reset" style="font-size: 18px; padding: 6px 16px;">リセット</button>
  </div>
  <img id="ref" style="max-width: 100%; max-height: 520px; display: none; margin: 0 auto; transition: opacity 0.3s;">
</div>
<script>
const cfg = __CONFIG__;
const imgs = cfg.images;
let idx = 0;
let phase = "ready";
let remain = cfg.pose;
let timer = null;
const $ = (id) => document.getElementById(id);

function fmt(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

function beep(freq) {
  if (!cfg.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 250);
  } catch (e) {}
}

function render() {
  $("time").textContent = fmt(Math.max(0, remain));
  let label = "";
  if (phase === "ready") label = "準備ができたらスタートを押してください";
  else if (phase === "draw") label = "描画中 " + (idx + 1) + " / " + cfg.count;
  else if (phase === "rest") label = "休憩中（次は " + (idx + 2) + " / " + cfg.count + "）";
  else if (phase === "done") label = "お疲れさまでした！全 " + cfg.count + " ポーズ完了";
  $("status").textContent = label;

  const img = $("ref");
  if (imgs.length > 0 && phase !== "done") {
    img.src = imgs[idx % imgs.length];
    img.style.display = "block";
    img.style.opacity = phase === "rest" ? 0.2 : 1;
  } else {
    img.style.display = "none";
  }

  const total = phase === "rest" ? cfg.rest : cfg.pose;
  const pct = (phase === "draw" || phase === "rest") && total > 0 ? 100 * (total - remain) / total : (phase === "done" ? 100 : 0);
  $("bar").style.width = pct + "%";
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function next() {
  if (phase === "draw") {
    if (idx >= cfg.count - 1) {
      phase = "done";
      remain = 0;
      stop();
      beep(880);
      render();
      return;
    }
    if (cfg.rest > 0) {
      phase = "rest";
      remain = cfg.rest;
    } else {
      idx++;
      remain = cfg.pose;
    }
    beep(660);
  } else if (phase === "rest") {
    idx++;
    phase = "draw";
    remain = cfg.pose;
    beep(990);
  }
  render();
}

function tick() {
  remain--;
  if (remain <= 0) {
    next();
  } else {
    if (remain <= 3) beep(440);
    render();
  }
}

$("start").onclick = () => {
  if (phase === "ready" || phase === "done") {
    idx = 0;
    phase = "draw";
    remain = cfg.pose;
    beep(990);
  }
  if (!timer) timer = setInterval(tick, 1000);
  render();
};
$("pause").onclick = () => { stop(); };
$("skip").onclick = () => { if (phase === "draw" || phase === "rest") next(); };
$("reset").onclick = () => {
  stop();
  idx = 0;
  phase = "ready";
  remain = cfg.pose;
  render();
};

render();
</script>
"""


def page_timer():
    st.title("⏱️ クロッキータイマー")
    st.write("資料画像をアップロードすると、時間ごとに自動で切り替わります。画像がなくてもタイマーとして使えます。")

    c1, c2, c3 = st.columns(3)
    preset = c1.selectbox("1ポーズの時間", ["30秒", "1分", "2分", "5分", "10分", "カスタム"], index=1)
    preset_map = {"30秒": 30, "1分": 60, "2分": 120, "5分": 300, "10分": 600}
    if preset == "カスタム":
        pose_seconds = c1.number_input("秒数", min_value=5, max_value=3600, value=90, step=5)
    else:
        pose_seconds = preset_map[preset]
    count = c2.number_input("ポーズ数", min_value=1, max_value=100, value=10)
    rest = c3.number_input("ポーズ間の休憩（秒）", min_value=0, max_value=300, value=5)

    files = st.file_uploader("資料画像（複数可）", type=["png", "jpg", "jpeg", "webp"], accept_multiple_files=True)
    o1, o2 = st.columns(2)
    shuffle = o1.checkbox("画像をシャッフル", value=True)
    sound = o2.checkbox("通知音を鳴らす", value=True)

    images = []
    if files:
        images = [image_to_data_uri(open_image(f)) for f in files]
        if shuffle:
            random.Random(len(images)).shuffle(images)
        if len(images) < count:
            st.caption(f"画像が{len(images)}枚なので、繰り返し表示されます。")

    config = {
        "pose": int(pose_seconds),
        "count": int(count),
        "rest": int(rest),
        "images": images,
        "sound": sound,
    }
    html = TIMER_HTML.replace("__CONFIG__", json.dumps(config))
    components.html(html, height=780 if images else 260)

    total = int(pose_seconds) * int(count) + int(rest) * max(0, int(count) - 1)
    st.caption(f"合計時間の目安: 約{total // 60}分{total % 60}秒")


def page_analysis():
    st.title("🔍 画像分析ツール")
    st.write("資料や自分の絵をアップロードして、明暗・形・色を確認できます。画像はサーバーに保存されません。")
    tab1, tab2, tab3, tab4 = st.tabs(["明暗・形チェック", "グリッド", "パレット抽出", "重ねて比較"])

    with tab1:
        f = st.file_uploader("画像", type=["png", "jpg", "jpeg", "webp"], key="ana_value")
        if f:
            img = open_image(f)
            c1, c2 = st.columns(2)
            mirror = c1.checkbox("左右反転（形の狂いチェック）")
            levels = c2.slider("階調数", 2, 8, 3)
            blur = st.slider("ぼかし（目を細めて見る効果）", 0, 30, 0)
            base = ImageOps.mirror(img) if mirror else img
            if blur > 0:
                base = base.filter(ImageFilter.GaussianBlur(blur))
            col1, col2, col3 = st.columns(3)
            col1.image(base, caption="元画像")
            col2.image(base.convert("L"), caption="グレースケール")
            col3.image(posterize_values(base, levels), caption=f"{levels}階調")
            st.caption("グレースケールで主役が目立たない場合、明暗差が不足している可能性があります。")

    with tab2:
        f = st.file_uploader("画像", type=["png", "jpg", "jpeg", "webp"], key="ana_grid")
        if f:
            img = open_image(f)
            c1, c2, c3 = st.columns(3)
            divisions = c1.slider("分割数", 2, 12, 3)
            color = c2.color_picker("線の色", "#FF0000")
            diagonal = c3.checkbox("対角線を表示")
            st.image(draw_grid(img, divisions, color, diagonal))
            st.caption("分割数3にすると三分割構図の確認に使えます。模写のときは同じ分割数のグリッドを自分の紙にも引きましょう。")

    with tab3:
        f = st.file_uploader("画像", type=["png", "jpg", "jpeg", "webp"], key="ana_palette")
        if f:
            img = open_image(f)
            n = st.slider("抽出する色数", 3, 16, 6)
            c1, c2 = st.columns([1, 1])
            c1.image(img)
            with c2:
                for hex_code, ratio in extract_palette(img, n):
                    st.markdown(
                        f"<div style='display:flex;align-items:center;margin-bottom:6px;'>"
                        f"<div style='width:60px;height:36px;background:{hex_code};border:1px solid #888;border-radius:4px;'></div>"
                        f"<code style='margin-left:12px;'>{hex_code}</code>"
                        f"<span style='margin-left:12px;'>{ratio * 100:.1f}%</span></div>",
                        unsafe_allow_html=True,
                    )

    with tab4:
        c1, c2 = st.columns(2)
        ref_file = c1.file_uploader("資料（お手本）", type=["png", "jpg", "jpeg", "webp"], key="ana_ref")
        my_file = c2.file_uploader("自分の絵", type=["png", "jpg", "jpeg", "webp"], key="ana_my")
        if ref_file and my_file:
            ref = open_image(ref_file)
            mine = open_image(my_file).resize(ref.size)
            mode = st.radio("表示方法", ["半透明で重ねる", "差分を表示", "横に並べる"], horizontal=True)
            if mode == "半透明で重ねる":
                alpha = st.slider("自分の絵の濃さ", 0.0, 1.0, 0.5)
                st.image(Image.blend(ref, mine, alpha))
            elif mode == "差分を表示":
                diff = ImageChops.difference(ref.convert("L"), mine.convert("L"))
                st.image(ImageOps.autocontrast(diff), caption="明るい部分ほどズレが大きい箇所です")
            else:
                s1, s2 = st.columns(2)
                s1.image(ref, caption="資料")
                s2.image(mine, caption="自分の絵")
            st.caption("模写の答え合わせに使えます。自分の絵は資料と同じ縦横比で描くと正確に比較できます。")


def page_log():
    st.title("📝 練習ログ")
    logs = load_logs()

    with st.form("log_form", clear_on_submit=True):
        c1, c2 = st.columns(2)
        date = c1.date_input("日付", value=dt.date.today())
        minutes = c2.number_input("練習時間（分）", min_value=1, max_value=1440, value=30)
        title = st.text_input("タイトル", placeholder="例: 手の模写10個")
        categories = st.multiselect("分野", CATEGORIES)
        rating = st.slider("自己評価", 1, 5, 3)
        memo = st.text_area("気づき・次の課題", placeholder="例: 親指の付け根の形がわかってきた。次は握った手を描く。")
        image_file = st.file_uploader("作品画像（任意）", type=["png", "jpg", "jpeg", "webp"])
        submitted = st.form_submit_button("記録する", type="primary")

    if submitted:
        entry_id = uuid.uuid4().hex
        image_name = None
        if image_file:
            image_name = f"{entry_id}.jpg"
            open_image(image_file, max_size=2000).save(IMG_DIR / image_name, format="JPEG", quality=90)
        logs.append({
            "id": entry_id,
            "date": date.isoformat(),
            "minutes": int(minutes),
            "title": title or "無題",
            "categories": categories,
            "rating": rating,
            "memo": memo,
            "image": image_name,
        })
        save_logs(logs)
        st.success("記録しました！")
        st.rerun()

    if not logs:
        st.write("まだ記録がありません。")
        return

    st.subheader("記録一覧")
    df = pd.DataFrame(logs).sort_values("date", ascending=False)
    view = df[["date", "title", "minutes", "categories", "rating", "memo"]].copy()
    view["categories"] = view["categories"].apply(lambda x: "、".join(x))
    view.columns = ["日付", "タイトル", "分", "分野", "自己評価", "メモ"]
    st.dataframe(view, hide_index=True)

    st.download_button(
        "CSVでダウンロード",
        view.to_csv(index=False).encode("utf-8-sig"),
        file_name="illust_practice_log.csv",
        mime="text/csv",
    )

    with st.expander("記録を削除"):
        options = {f"{l['date']} {l['title']} ({l['minutes']}分)": l["id"] for l in sorted(logs, key=lambda x: x["date"], reverse=True)}
        target = st.selectbox("削除する記録", list(options.keys()))
        if st.button("削除する"):
            target_id = options[target]
            for log in logs:
                if log["id"] == target_id and log.get("image"):
                    path = IMG_DIR / log["image"]
                    if path.exists():
                        path.unlink()
            save_logs([l for l in logs if l["id"] != target_id])
            st.rerun()


def page_gallery():
    st.title("🖼️ 成長ギャラリー")
    logs = [l for l in load_logs() if l.get("image") and (IMG_DIR / l["image"]).exists()]
    if not logs:
        st.write("画像付きの練習記録がありません。「練習ログ」で作品画像を登録しましょう。")
        return
    logs.sort(key=lambda x: x["date"])

    st.subheader("ビフォー・アフター比較")
    labels = [f"{l['date']} {l['title']}" for l in logs]
    c1, c2 = st.columns(2)
    before = c1.selectbox("比較元", range(len(logs)), format_func=lambda i: labels[i], index=0)
    after = c2.selectbox("比較先", range(len(logs)), format_func=lambda i: labels[i], index=len(logs) - 1)
    c1.image(str(IMG_DIR / logs[before]["image"]))
    c2.image(str(IMG_DIR / logs[after]["image"]))
    days = (dt.date.fromisoformat(logs[after]["date"]) - dt.date.fromisoformat(logs[before]["date"])).days
    st.caption(f"{abs(days)}日間の変化です。")

    st.divider()
    st.subheader("作品一覧")
    filter_cat = st.multiselect("分野で絞り込み", CATEGORIES)
    shown = [l for l in reversed(logs) if not filter_cat or set(filter_cat) & set(l["categories"])]
    cols = st.columns(3)
    for i, log in enumerate(shown):
        with cols[i % 3]:
            st.image(str(IMG_DIR / log["image"]))
            st.caption(f"{log['date']} {log['title']} ／ {'★' * log['rating']}")


def page_roadmap():
    st.title("🗺️ 練習ロードマップ")
    state = load_json(ROADMAP_FILE, {})
    total = sum(len(tasks) for tasks in ROADMAP.values())
    done_total = 0
    changed = False

    for stage, tasks in ROADMAP.items():
        done = sum(1 for t in tasks if state.get(f"{stage}::{t}", False))
        done_total += done
        with st.expander(f"{stage}（{done}/{len(tasks)}）", expanded=done < len(tasks)):
            st.progress(done / len(tasks))
            for task in tasks:
                key = f"{stage}::{task}"
                checked = st.checkbox(task, value=state.get(key, False), key=f"rm_{key}")
                if checked != state.get(key, False):
                    state[key] = checked
                    changed = True

    if changed:
        save_json(ROADMAP_FILE, state)
        st.rerun()

    st.metric("全体の達成率", f"{done_total / total * 100:.0f}%")
    if done_total == total:
        st.balloons()
        st.success("全ステップ達成です！ここからは描きたいものをどんどん描いていきましょう。")


def page_selfcheck():
    st.title("✅ セルフチェック")
    st.write("描き終えた絵を見直すときに、当てはまる項目にチェックを入れてください。")
    f = st.file_uploader("チェックする絵（任意）", type=["png", "jpg", "jpeg", "webp"], key="sc_img")
    if f:
        img = open_image(f)
        c1, c2 = st.columns(2)
        c1.image(img, caption="元の絵")
        c2.image(ImageOps.mirror(img).convert("L"), caption="反転＋グレースケール")

    results = []
    for i, (item, tip) in enumerate(SELF_CHECK):
        results.append((st.checkbox(item, key=f"sc_{i}"), item, tip))

    score = sum(1 for ok, _, _ in results if ok)
    st.progress(score / len(SELF_CHECK), text=f"{score} / {len(SELF_CHECK)} 項目クリア")

    if st.button("改善ポイントを表示", type="primary"):
        weak = [(item, tip) for ok, item, tip in results if not ok]
        if not weak:
            st.success("すべてクリアしています。次はより難しいお題に挑戦してみましょう。")
        else:
            for item, tip in weak:
                st.warning(f"{item}\n\n{tip}")

JSON_FILES = ("logs.json", "roadmap.json", "settings.json")


def build_backup_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in DATA_DIR.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(DATA_DIR).as_posix())
    return buf.getvalue()


def is_allowed_member(name):
    if name in JSON_FILES:
        return True
    parts = name.split("/")
    if len(parts) != 2 or parts[0] != "images":
        return False
    filename = parts[1]
    return filename.endswith(".jpg") and Path(filename).name == filename and filename != ".jpg"


def restore_backup_zip(data):
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        members = [m for m in zf.namelist() if is_allowed_member(m)]
        if not members:
            raise ValueError("イラスト練習ラボのバックアップファイルではありません。")
        contents = {m: zf.read(m) for m in members}
    for name in JSON_FILES:
        if name in contents:
            json.loads(contents[name].decode("utf-8"))
    if DATA_DIR.exists():
        shutil.rmtree(DATA_DIR)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    for name, body in contents.items():
        (DATA_DIR / name).write_bytes(body)


def page_data():
    st.title("💾 データ管理")
    if IS_BROWSER:
        st.info(
            "データはこのブラウザ内（IndexedDB）に保存されています。"
            "ブラウザのサイトデータを削除すると消えるため、定期的にバックアップしてください。"
            "別の端末やブラウザにデータを移すときも、バックアップと復元を使います。"
        )
    else:
        st.info(f"データは {DATA_DIR.resolve()} に保存されています。")

    if st.session_state.pop("restore_done", False):
        st.success("復元が完了しました。")

    st.subheader("バックアップ")
    logs = load_logs()
    image_count = sum(1 for p in IMG_DIR.glob("*.jpg"))
    st.write(f"練習記録: {len(logs)} 件 ／ 作品画像: {image_count} 枚")
    st.download_button(
        "バックアップをダウンロード（ZIP）",
        build_backup_zip(),
        file_name=f"illust_lab_backup_{dt.date.today().isoformat()}.zip",
        mime="application/zip",
        type="primary",
    )

    st.divider()
    st.subheader("復元")
    st.warning("復元すると、現在のデータはすべてバックアップの内容に置き換わります。")
    backup = st.file_uploader("バックアップZIP", type=["zip"], key="restore_zip")
    if backup and st.button("このファイルから復元する"):
        try:
            restore_backup_zip(backup.getvalue())
        except (zipfile.BadZipFile, ValueError, UnicodeDecodeError) as e:
            st.error(f"復元できませんでした: {e}")
        else:
            st.session_state["restore_done"] = True
            st.rerun()

    st.divider()
    st.subheader("全データの削除")
    confirm = st.checkbox("すべての記録・画像・進捗を削除することを理解しました")
    if st.button("全データを削除", disabled=not confirm):
        if DATA_DIR.exists():
            shutil.rmtree(DATA_DIR)
        IMG_DIR.mkdir(parents=True, exist_ok=True)
        st.rerun()JSON_FILES = ("logs.json", "roadmap.json", "settings.json")


def build_backup_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in DATA_DIR.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(DATA_DIR).as_posix())
    return buf.getvalue()


def is_allowed_member(name):
    if name in JSON_FILES:
        return True
    parts = name.split("/")
    if len(parts) != 2 or parts[0] != "images":
        return False
    filename = parts[1]
    return filename.endswith(".jpg") and Path(filename).name == filename and filename != ".jpg"


def restore_backup_zip(data):
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        members = [m for m in zf.namelist() if is_allowed_member(m)]
        if not members:
            raise ValueError("イラスト練習ラボのバックアップファイルではありません。")
        contents = {m: zf.read(m) for m in members}
    for name in JSON_FILES:
        if name in contents:
            json.loads(contents[name].decode("utf-8"))
    if DATA_DIR.exists():
        shutil.rmtree(DATA_DIR)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    for name, body in contents.items():
        (DATA_DIR / name).write_bytes(body)


def page_data():
    st.title("💾 データ管理")
    if IS_BROWSER:
        st.info(
            "データはこのブラウザ内（IndexedDB）に保存されています。"
            "ブラウザのサイトデータを削除すると消えるため、定期的にバックアップしてください。"
            "別の端末やブラウザにデータを移すときも、バックアップと復元を使います。"
        )
    else:
        st.info(f"データは {DATA_DIR.resolve()} に保存されています。")

    if st.session_state.pop("restore_done", False):
        st.success("復元が完了しました。")

    st.subheader("バックアップ")
    logs = load_logs()
    image_count = sum(1 for p in IMG_DIR.glob("*.jpg"))
    st.write(f"練習記録: {len(logs)} 件 ／ 作品画像: {image_count} 枚")
    st.download_button(
        "バックアップをダウンロード（ZIP）",
        build_backup_zip(),
        file_name=f"illust_lab_backup_{dt.date.today().isoformat()}.zip",
        mime="application/zip",
        type="primary",
    )

    st.divider()
    st.subheader("復元")
    st.warning("復元すると、現在のデータはすべてバックアップの内容に置き換わります。")
    backup = st.file_uploader("バックアップZIP", type=["zip"], key="restore_zip")
    if backup and st.button("このファイルから復元する"):
        try:
            restore_backup_zip(backup.getvalue())
        except (zipfile.BadZipFile, ValueError, UnicodeDecodeError) as e:
            st.error(f"復元できませんでした: {e}")
        else:
            st.session_state["restore_done"] = True
            st.rerun()

    st.divider()
    st.subheader("全データの削除")
    confirm = st.checkbox("すべての記録・画像・進捗を削除することを理解しました")
    if st.button("全データを削除", disabled=not confirm):
        if DATA_DIR.exists():
            shutil.rmtree(DATA_DIR)
        IMG_DIR.mkdir(parents=True, exist_ok=True)
        st.rerun()

PAGES = {
    "ダッシュボード": page_dashboard,
    "お題ガチャ": page_prompt,
    "クロッキータイマー": page_timer,
    "画像分析ツール": page_analysis,
    "練習ログ": page_log,
    "成長ギャラリー": page_gallery,
    "ロードマップ": page_roadmap,
    "セルフチェック": page_selfcheck,
    "データ管理": page_data,
}

with st.sidebar:
    st.title("🎨 イラスト練習ラボ")
    page = st.radio("メニュー", list(PAGES.keys()))
    current_streak, _ = calc_streaks(load_logs())
    st.divider()
    st.metric("🔥 連続練習", f"{current_streak} 日")
    st.caption("毎日少しずつでも描くことが上達への近道です。")

PAGES[page]()