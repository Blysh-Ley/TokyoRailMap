const toText = (v) => String(v ?? '').trim();

export const LINE_TYPE_EXCLUSION_RULES = [
    ['JR-East.ChuoSobuLocal', 'JR-East.LimitedExpress']
];

const LINE_TYPE_EXCLUSION_KEYS = new Set(
    LINE_TYPE_EXCLUSION_RULES
        .map((pair) => {
            const lineId = toText(pair?.[0]);
            const typeId = toText(pair?.[1]);
            if (!lineId || !typeId) return '';
            return `${lineId}||${typeId}`;
        })
        .filter(Boolean)
);

export const isExcludedLineType = (lineIdRaw, typeIdRaw) => {
    const lineId = toText(lineIdRaw);
    const typeId = toText(typeIdRaw);
    if (!lineId || !typeId) return false;
    return LINE_TYPE_EXCLUSION_KEYS.has(`${lineId}||${typeId}`);
};


// 自定义合并支线：某些支线虽然命名上是“主线 + Branch”，但实际上应该归并到主线下（如武藏野线大宫支线）。这种特殊情况单独列出来，优先判断。
export const specialMainByBranch = {
    'JR-East.KeiyoKoyaBranch': 'JR-East.Musashino',
    'JR-East.KeiyoFutamataBranch': 'JR-East.Musashino', 
    'Seibu.S-Fukutoshin': 'Seibu.Ikebukuro',
    'Seibu.S-Yurakucho': 'Seibu.Ikebukuro',
    'Tobu.JRTobuConnection' : 'Tobu.Nikko',
    "JR-East.NaritaAirportBranch": 'JR-East.Narita',
    "JR-East.NaritaAbikoBranch": 'JR-East.Narita',
    "Keio.KeioNew": "Keio.Keio"
};

// 公司信息，主要用于在车站信息面板显示公司 logo。数据来源Wikipedia。
export const companyLogoMap = {
    'JR-East': { 'zh': 'JR东日本', 'img': ["jreast.png"], 'abb': "JR", 'type': "JR铁路公司" },
    'JR-Central': { 'zh': 'JR东海', 'img': ["jrc.svg"], 'abb': "JR东海", 'type': "JR铁路公司" },
    'TokyoMetro': { 'zh': '东京地下铁', 'img': ["Tokyometro.png", 60], 'abb': "东京地下铁", 'type': "大手私铁/地下铁" },
    'Toei': { 'zh': '都营地下铁', 'img': ["duyinmetro.svg"], 'abb': "都营地下铁", 'type': "地下铁" },
    //'Toei': { 'zh': '都营交通', 'img': ["duyinmetro.svg"],'abb':"都营交通" },
    'Keio': { 'zh': '京王电铁', 'img': ["jingwang.svg", 65], 'abb': "京王", 'type': "大手私铁", 'order': ['京王线', '新线', '井之头'] },
    'Tobu': { 'zh': '东武铁道', 'img': ["dongwu.svg", 70], 'abb': "东武", 'type': "大手私铁", 'order': ['晴空塔', '伊势崎', '日光', '东上', '都市公园', '龟户'] },
    'Tokyu': { 'zh': '东急电铁', 'img': ["dongji.png"], 'abb': "东急", 'type': "大手私铁" },
    'Seibu': { 'zh': '西武铁道', 'img': ["xiwu.png"], 'abb': "西武", 'type': "大手私铁", 'order': ['池袋', '新宿'] },
    'Keikyu': { 'zh': '京急电铁', 'img': ["jingji.png", 65], 'abb': "京急", 'type': "大手私铁", 'order': ['本线', '空港'] },
    'Odakyu': { 'zh': '小田急电铁', 'img': ["xiaotianji.png"], 'abb': "小田急", 'type': "大手私铁", 'order': ['小田原', '江之岛', '多摩'] },
    'Keisei': { 'zh': '京成电铁', 'img': ["jingcheng.png", 60], 'abb': "京成", 'type': "大手私铁", 'order': ['本线', '空港', '押上'] },
    'Sotetsu': { 'zh': '相模铁道', 'img': ["xiangmo.png"], 'abb': "相铁", 'type': "大手私铁" },
    'Hokuso': { 'zh': '北总铁道', 'img': ["beizong.png", 80] },
    'MIR': { 'zh': '首都圈新都市铁道', 'img': ["TsukubaExpress.png", 40] },
    'TokyoMonorail': { 'zh': '东京单轨电车', 'img': ["tokyoMonorail.png"] },
    'TWR': { 'zh': '东京临海高速铁道', 'img': ["linhai.png", 40] },
    'Yurikamome': { 'zh': '新交通百合鸥', 'img': ["yurikamome.png", 45] },
    'Disney': { 'zh': '迪士尼', 'img': ["disney.png", 65], 'abb': " " },
    'YokohamaMunicipal': { 'zh': '横滨市营地下铁', 'img': ["yokohamaMetro.svg"], 'type': "地下铁" },
    'YokohamaSeaside': { 'zh': '横滨海岸线', 'img': ["YokohamaSeaside.png", 45] },
    'Minatomirai': { 'zh': '横滨高速铁道', 'img': ["gangweilai.png"] },
    //'Yokohama Ropeway': { 'zh': '横滨索道', 'img': ["quanyang.png"]},
    'ChibaMonorail': { 'zh': '千叶都市单轨', 'img': ["chibaMonorail.png", 35] },
    'ToyoRapid': { 'zh': '东叶高速铁道', 'img': ["dongyegaosu.png", 40] },
    'Ryutetsu': { 'zh': '流铁', 'img': ["liutie.png", 35] },
    'Yamaman': { 'zh': '山万', 'img': ["shanwan.png", 35] },
    'SaitamaTransit': { 'zh': '埼玉新都市交通', 'img': ["SaitamaNUT.png"] },
    'SaitamaRailway': { 'zh': '埼玉高速铁道', 'img': ["qiyugaosu.png", 50] },
    'TamaMonorail': { 'zh': '多摩都市单轨', 'img': ["TamaMonorail.png"] },
    'ShonanMonorail': { 'zh': '湘南单轨电车', 'img': ["shonanMonorail.png", 50] },
    'KantoRailway': { 'zh': '关东铁道', 'img': ["guandong.png", 35] },
    'Enoden': { 'zh': '江之岛电铁', 'img': ["jiangdian.png", 60] },
    'UtsunomiyaLightRail': { 'zh': '宇都宫轻轨', 'img': ["yudugong.png", 35] },
    'KashimaRinkai': { 'zh': '鹿岛临海铁道', 'img': ["ludao.png", 35] },
    'Choshi': { 'zh': '铫子电气铁道', 'img': ["yaozi.png", 35] },
    'Isumi': { 'zh': '夷隅铁道', 'img': ["yiou.png", 35] },
    'Fujikyu': { 'zh': '富士急行', 'img': ["fushi.png", 40] },
    'Shibayama': { 'zh': '芝山铁道', 'img': ["zhishan.png"] },
    'Kominato': { 'zh': '小凑铁道', 'img': ["xiaocou.png", 35] },
    'Izukyu': { 'zh': '伊豆急行', 'img': ["yidouji.png"] },
    'Hitachinaka':{'zh':'常陆那珂海滨铁道','img':["hitachinaka.svg",35]},
    'IzuHakone': { 'zh': '伊豆箱根铁道', 'img':["yidouxianggen.png",35] },
    'OdakyuHakone': { 'zh': '箱根登山铁道', 'img':["xiaotianji.png"] },
    'Chichibu': { 'zh': '秩父铁道', 'img': ["zhifu.svg", 35] },
    //'Jōmō Electric Railway': { 'zh': '上毛电气铁道', 'img':["shangmao.svg",35] },
    'Moka': { 'zh': '真冈铁道', 'img':["zhengang.svg",35] },
    //'Jōshin Dentetsu': { 'zh': '上信电铁', 'img':["shangxin.svg",35] },
    //'Watarase Keikoku Railway': { 'zh': '渡良濑溪谷铁道', 'img':["dulianglai.png",35] }
};

// 车公司优先级，决定了在Menu面板等处显示多个公司时的排序。
export const preferredOrder = [
    'JR-East',           // JR东日本
    'TokyoMetro',        // 东京地下铁
    'Toei',              // 都营地下铁
    'YokohamaMunicipal', // 横滨市营地下铁
    'Tobu',              // 东武铁道
    'Keisei',            // 京成电铁
    'Seibu',             // 西武铁道
    'Odakyu',            // 小田急电铁
    'Tokyu',             // 东急电铁
    'Keio',              // 京王电铁
    'Keikyu',            // 京急电铁
    'Sotetsu',           // 相模铁道
    'JR-Central',        // JR东海
    'TokyoMonorail',     // 东京单轨电车
    'MIR',               // 首都圈新都市铁道
    'ShonanMonorail',    // 湘南单轨电车
    'ChibaMonorail',     // 千叶都市单轨 
    'TamaMonorail',      // 多摩都市单轨
    'Hokuso'             // 北总铁道
];