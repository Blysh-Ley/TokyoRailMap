export const lineIconSettings = {
    // Edit a company here first. Each company points to complete designs below.
    companies: [
        { key: 'JR-East', label: 'JR东日本', match: { routePrefixes: ['TokyoRail.Temp.', 'TokyoRail.MenuThrough.'] }, lineIcon: { design: 'jr-east-square' }, stationBadge: { design: 'jr-east-station-square' } },
        { key: 'JR-East', label: 'JR东日本', match: { routeIds: ['JR-East.NaritaExpress'] }, lineIcon: { design: 'nex' }, stationBadge: { design: 'jr-east-station-square' } },
        { key: 'JR-East', label: 'JR东日本', match: { routePrefixes: ['JR-East.'] }, lineIcon: { design: 'jr-east-square' }, stationBadge: { design: 'jr-east-station-square' } },
        { key: 'JR-Central', label: 'JR东海', match: { routePrefixes: ['JR-Central'] }, lineIcon: { design: 'jr-central-rectangle' }, stationBadge: { design: 'jr-central-station-square' } },
        { key: 'TokyoMetro', label: '东京地下铁', match: { routePrefixes: ['TokyoMetro.'] }, lineIcon: { design: 'circle-border' }, stationBadge: { design: 'subway-station-roundel' } },
        { key: 'Toei', label: '都营交通/地下铁', match: { routeIds: ['Toei.NipporiToneri'] }, lineIcon: { design: 'nippori-toneri' }, stationBadge: { design:'nippori-toneri-station' } },
        { key: 'Toei', label: '都营交通/地下铁', match: { routeIds: ['Toei.Arakawa'] }, lineIcon: { design: 'arakawa' }, stationBadge: { design: 'arakawa-station' } },
        { key: 'Toei', label: '都营交通/地下铁', match: { routePrefixes: ['Toei.Mita'] }, lineIcon: { design: 'circle-border-mita' }, stationBadge: { design: 'subway-station-roundel' } },
        { key: 'Toei', label: '都营交通/地下铁', match: { routePrefixes: ['Toei.'] }, lineIcon: { design: 'circle-border' }, stationBadge: { design: 'subway-station-roundel' } },
        { key: 'Keio', label: '京王电铁', match: { routePrefixes: ['Keio.'] }, lineIcon: { design: 'keio-circle-thin-border' }, stationBadge: { design: 'keio-circle-thin-border-station' } },
        { key: 'Tobu', label: '东武铁道', match: { routePrefixes: ['Tobu.'] }, lineIcon: { design: 'tobu-rounded-square' }, stationBadge: { design: 'tobu-rounded-square-station' } },
        { key: 'Tokyu', label: '东急电铁', match: { routePrefixes: ['Tokyu.'] }, lineIcon: { design: 'rectangle' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'Seibu', label: '西武铁道', match: { routePrefixes: ['Seibu.'] }, lineIcon: { design: 'seibu' }, stationBadge: { design: 'seibu-station' } },
        { key: 'Keikyu', label: '京急电铁', match: { routePrefixes: ['Keikyu.'] }, lineIcon: { design: 'keikyu' }, stationBadge: { design: 'keikyu-station' } },
        { key: 'Odakyu', label: '小田急电铁', match: { routePrefixes: ['Odakyu.'] }, lineIcon: { design: 'odakyu' }, stationBadge: { design: 'odakyu-station' } },
        { key: 'Keisei', label: '京成电铁', match: { routePrefixes: ['Keisei.'] }, lineIcon: { design: 'keisei' }, stationBadge: { design: 'keisei-station' } },
        { key: 'Sotetsu', label: '相模铁道', match: { routePrefixes: ['Sotetsu.'] }, lineIcon: { design: 'sotetsu-rounded-square' }, stationBadge: { design: 'sotetsu-station' } },
        { key: 'Hokuso', label: '北总铁道', match: { routePrefixes: ['Hokuso.'] }, lineIcon: { design: 'keisei' }, stationBadge: { design: 'keisei-station' } },
        { key: 'MIR', label: '首都圈新都市铁道', match: { routePrefixes: ['MIR.'] }, lineIcon: { design: 'mir-double-border' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'TokyoMonorail', label: '东京单轨电车', match: { routePrefixes: ['TokyoMonorail.'] }, lineIcon: { design: 'jr-east-square' }, stationBadge: { design: 'jr-east-station-square' } },
        { key: 'TWR', label: '东京临海高速铁道', match: { routeIds: ['TWR.Rinkai'] }, lineIcon: { design: 'twr-roundel' }, stationBadge: { design: 'twr-station-roundel' } },
        { key: 'Yurikamome', label: '新交通百合鸥', match: { routeIds: ['Yurikamome.Yurikamome'] }, lineIcon: { design: 'circle' }, stationBadge: { design: 'yurikamome-station-roundel' } },
        { key: 'Disney', label: '迪士尼', match: { routePrefixes: ['Disney.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'subway-station-roundel' } },
        { key: 'YokohamaMunicipal', label: '横滨市营地下铁', match: { routePrefixes: ['YokohamaMunicipal.'] }, lineIcon: { design: 'circle' }, stationBadge: { design: 'yokohama-subway-station-roundel' } },
        { key: 'YokohamaSeaside', label: '横滨海岸线', match: { routePrefixes: ['YokohamaSeaside.'] }, lineIcon: { design: 'circle-thin-border'  }, stationBadge: { design: 'yokohama-seaside-station-roundel' } },
        { key: 'Minatomirai', label: '横滨高速铁道', match: { routeIds: ['Minatomirai.Minatomirai'] }, lineIcon: { design: 'minatomirai-wave-square' }, stationBadge: { design: 'minatomirai-station' } },
        { key: 'ChibaMonorail', label: '千叶都市单轨', match: { routePrefixes: ['ChibaMonorail.'] }, lineIcon: { design: 'chiba-monorail' }, stationBadge: { design: 'chiba-monorail-station' } },
        { key: 'ToyoRapid', label: '东叶高速铁道', match: { routePrefixes: ['ToyoRapid.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'toyorapid-circle-thin-station' } },
        { key: 'Ryutetsu', label: '流铁', match: { routePrefixes: ['Ryutetsu.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'circle-thin-station' } },
        { key: 'Yamaman', label: '山万', match: { routePrefixes: ['Yamaman.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'circle-thin-station' } },
        { key: 'SaitamaTransit', label: '埼玉新都市交通', match: { routePrefixes: ['SaitamaTransit.'] }, lineIcon: { design: 'saitama-transit-hexagon' }, stationBadge: { design: 'saitama-transit-station-hexagon' } },
        { key: 'SaitamaRailway', label: '埼玉高速铁道', match: { routePrefixes: ['SaitamaRailway.'] }, lineIcon: { design: 'saitama-railway-circle-thin-border' }, stationBadge: { design: 'saitama-railway-circle-thin-station' } },
        { key: 'TamaMonorail', label: '多摩都市单轨', match: { routePrefixes: ['TamaMonorail.'] }, lineIcon: { design: 'jr-east-square' }, stationBadge: { design: 'jr-east-station-square'  } },
        { key: 'ShonanMonorail', label: '湘南单轨电车', match: { routePrefixes: ['ShonanMonorail.'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'KantoRailway', label: '关东铁道', match: { routePrefixes: ['KantoRailway.'] }, lineIcon: { design: 'circle-thin-border'  }, stationBadge: { design: 'circle-thin-station'} },
        { key: 'Enoden', label: '江之岛电铁', match: { routeIds: ['Enoden.Enoden'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'circle-thin-station' } },
        { key: 'UtsunomiyaLightRail', label: '宇都宫轻轨', match: { routePrefixes: ['UtsunomiyaLightRail.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'circle-thin-station' }},
        { key: 'KashimaRinkai', label: '鹿岛临海铁道', match: { routePrefixes: ['KashimaRinkai.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'circle-thin-station' } },
        { key: 'Choshi', label: '铫子电气铁道', match: { routePrefixes: ['Choshi.'] }, lineIcon: { design: 'Choshi' }, stationBadge: { design: 'Choshi-station' } },
        { key: 'Isumi', label: '夷隅铁道', match: { routePrefixes: ['Isumi.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'circle-thin-station' } },
        { key: 'Fujikyu', label: '富士急行', match: { routePrefixes: ['Fujikyu.'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'Shibayama', label: '芝山铁道', match: { routePrefixes: ['Shibayama.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'circle-thin-station' } },
        { key: 'Kominato', label: '小凑铁道', match: { routePrefixes: ['Kominato.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'circle-thin-station' } },
        { key: 'Izukyu', label: '伊豆急行', match: { routePrefixes: ['Izukyu.'] }, lineIcon: { design: 'rectangle' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'Hitachinaka', label: '常陆那珂海滨铁道', match: { routePrefixes: ['Hitachinaka.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'circle-thin-station' }},
        { key: 'IzuHakone', label: '伊豆箱根铁道', match: { routePrefixes: ['IzuHakone.'] }, lineIcon: { design: 'circle' }, stationBadge: { design: 'yokohama-subway-station-roundel' } },
        { key: 'OdakyuHakone', label: '箱根登山铁道', match: { routePrefixes: ['OdakyuHakone.'] }, lineIcon: { design: 'odakyu' }, stationBadge: { design: 'odakyu-station' } },
        { key: 'Chichibu', label: '秩父铁道', match: { routePrefixes: ['Chichibu.'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'seibu-station' } },
        { key: 'Moka', label: '真冈铁道', match: { routePrefixes: ['Moka.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'circle-thin-station' } }
    ],
    lineIcon: {
        className: 'rw-line-icon',
        defaultDesign: 'rectangle-border',
        emptyRouteDesign: 'default'
    },
    lineIconDesigns: {
        default: {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 10, y: 10, width: 80, height: 80, rx: 11, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 14 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#000', dark: '#fff' },
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        hidden: {
            html: {
                rootStyle: {
                    display: 'none',
                    width: '0',
                    height: '0',
                    minWidth: '0',
                    padding: '0',
                    margin: '0',
                    border: '0',
                    overflow: 'hidden'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 1 1', width: '0', height: '0', 'aria-hidden': 'true', focusable: 'false' },
                style: { display: 'none' }
            },
            text: { hidden: true }
        },
        'company-logo-width': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', minWidth: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'hidden'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', width: '25px', height: '25px', overflow: 'hidden' }
            },
            image: {
                fit: 'width',
                attrs: { x: 0, width: 100, preserveAspectRatio: 'xMidYMid meet' }
            },
            text: { hidden: true }
        },
        circle: {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'circle', attrs: { cx: 50, cy: 50, r: 44, fill: 'fillColor' } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#fff', dark: '#000' },
                fontSizeByCodeLength: [{ max: 1, value: 58 }, { max: 2, value: 46 }, { value: 34 }],
                textLengthByCodeLength: [{ max: 1, value: 40 }, { max: 2, value: 50 }, { value: 66 }],
                y: 52
            }
        },
        'twr-roundel': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'circle', attrs: { cx: 50, cy: 50, r: 50, fill: '#8bc9cf' } },
            decorations: [
                { tag: 'circle', attrs: { cx: 50, cy: 50, r: 37, fill: '#3b287f', stroke: '#fff', 'stroke-width': 4 } }
            ],
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: '#fff',
                fontSizeByCodeLength: [{ max: 1, value: 55 }, { max: 2, value: 44 }, { value: 30 }],
                textLengthByCodeLength: [{ max: 1, value: 31 }, { max: 2, value: 53 }, { value: 66 }],
                y: 50
            }
        },
        'circle-border': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'circle', attrs: { cx: 50, cy: 50, r: 38, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 20 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#000', dark: '#fff' },
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 51
            }
        },
        'circle-border-mita':{
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'circle', attrs: { cx: 50, cy: 50, r: 38, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 20 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#000', dark: '#fff' },
                fontSizeByCodeLength: [{ max: 1, value: 48}, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 20}, { max: 2, value: 50 }, { value: 66 }],
                y: 51
            }
        },
        'circle-thin-border': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'circle', attrs: { cx: 50, cy: 50, r: 41, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 12 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#000', dark: '#fff' },
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        'saitama-railway-circle-thin-border':{
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'circle', attrs: { cx: 50, cy: 50, r: 41, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 15 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#000', dark: '#fff' },
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        'chiba-monorail': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'circle', attrs: { cx: 50, cy: 50, r: 41, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 12 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#000', dark: '#fff' },
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        'keisei': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'circle', attrs: { cx: 50, cy: 50, r: 41, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 12 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: 'fillColor',
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        'keikyu': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'circle', attrs: { cx: 50, cy: 50, r: 41, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 12 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 1000, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: '#03346E',
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        'keio-circle-thin-border': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'circle', attrs: { cx: 50, cy: 50, r: 41, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 12 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: 'fillColor',
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        hexagon: {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'polygon', attrs: { points: '50 5,89 27,89 73,50 95,11 73,11 27', fill: 'fillColor' } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#000', dark: '#fff' },
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        'saitama-transit-hexagon': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'polygon', attrs: { points: '24.8 6.6,75.2 6.6,100 50,75.2 93.4,24.8 93.4,0 50', fill: 'fillColor' } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: '#fff',
                fontSizeByCodeLength: [{ max: 1, value: 56 }, { max: 2, value: 43 }, { value: 30 }],
                textLengthByCodeLength: [{ max: 1, value: 36 }, { max: 2, value: 66 }, { value: 72 }],
                y: 51
            }
        },
        rectangle: {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 8, y: 8, width: 84, height: 84, rx: 12, fill: 'fillColor' } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#fff', dark: '#000' },
                fontSizeByCodeLength: [{ max: 1, value: 63 }, { max: 2, value: 53 }, { value: 31 }],
                textLengthByCodeLength: [{ max: 1, value: 38 }, { max: 2, value: 58 }, { value: 64 }],
                y: 50
            }
        },
        'rectangle-border': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 10, y: 10, width: 80, height: 80, rx: 11, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 14 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#000', dark: '#fff' },
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        'jr-east-square': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 8, y: 8, width: 84, height: 84, rx: 7, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 12 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#000', dark: '#000' },
                fontSizeByCodeLength: [{ max: 1, value: 56 }, { max: 2, value: 47 }, { value: 32 }],
                textLengthByCodeLength: [{ max: 1, value: 34 }, { max: 2, value: 58 }, { value: 66 }],
                y: 50
            }
        },
        'jr-central-rectangle': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 0, y: 0, width: '100%', height: '100%', rx: 0, fill: 'fillColor' } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#fff', dark: '#000' },
                fontSizeByCodeLength: [{ max: 1, value: 63 }, { max: 2, value: 54 }, { value: 32 }],
                textLengthByCodeLength: [{ max: 1, value: 38 }, { max: 2, value: 62 }, { value: 66 }],
                y: 50
            }
        },
        'tobu-rounded-square': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 10, y: 10, width: 80, height: 80, rx: 22, fill: 'backgroundColor', stroke: 'borderColor', 'stroke-width': 14 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#000', dark: '#fff' },
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        'Choshi':{
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 10, y: 10, width: 80, height: 80, rx: 5, fill: '#fff', stroke: '#000', 'stroke-width': 3 } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: '#000',
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 60 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 70 }, { value: 66 }],
                y: 50
            }
        },
        'solid-rounded-square': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 8, y: 8, width: 84, height: 84, rx: 12, fill: 'fillColor' } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: '#fff',
                fontSizeByCodeLength: [{ max: 1, value: 58 }, { max: 2, value: 47 }, { value: 31 }],
                textLengthByCodeLength: [{ max: 1, value: 36 }, { max: 2, value: 58 }, { value: 64 }],
                y: 50
            }
        },
        'minatomirai-wave-square': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 0, y: 0, width: 100, height: 100, rx: 10, fill: 'fillColor' } },
            decorations: [
                {
                    tag: 'path',
                    attrs: {
                        fill: '#0095b5',
                        transform: 'scale(0.1)',
                        d: 'm 709.77914,781.58463 c -41.553,-2.4118 -90.83353,-11.50303 -199.2386,-36.75536 C 402.643,719.69515 372.61661,713.90381 334.50747,710.87689 c -54.99795,-4.36836 -134.65996,7.44076 -256.928578,38.08719 -23.249142,5.82736 -42.469124,10.39725 -42.711071,10.1553 -0.241947,-0.24194 11.05241,-5.35142 25.098573,-11.35439 102.616896,-43.85579 198.471346,-75.78141 257.605636,-85.79904 23.92781,-4.05348 38.9418,-4.90635 64.57691,-3.66829 46.16475,2.22956 84.70649,7.03429 210.95758,26.29859 119.09373,18.17218 147.68903,20.93075 207.08128,19.97705 52.32032,-0.84014 96.47531,-5.76849 150.93181,-16.84622 8.28646,-1.68566 15.22929,-2.90184 15.4285,-2.70263 0.61043,0.61043 -13.27962,13.30982 -23.16819,21.18218 -40.28923,32.0746 -85.8963,53.96218 -139.15442,66.78253 -34.48474,8.30119 -59.80871,10.6059 -94.44636,8.59547 z',
                    }
                }
            ],
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'text-width':'80px', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#fff', dark: '#000' },
                fontSizeByCodeLength: [{ max: 1, value: 58 }, { max: 2, value: 47 }, { value: 31 }],
                textLengthByCodeLength: [{ max: 1, value: 36 }, { max: 2, value: 58 }, { value: 64 }],
                y: 44
            }
        },
        'mir-double-border': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 0, y: 0, width: 100, height: 100, rx: 13, fill: 'fillColor' } },
            decorations: [
                { tag: 'rect', attrs: { x: 8, y: 8, width: 84, height: 84, rx: 6, fill: 'none', stroke: '#fff', 'stroke-width': 6 } }
            ],
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: '#fff',
                fontSizeByCodeLength: [{ max: 1, value: 58 }, { max: 2, value: 49 }, { value: 31 }],
                textLengthByCodeLength: [{ max: 1, value: 34 }, { max: 2, value: 69 }, { value: 66 }],
                y: 52
            }
        },
        'sotetsu-rounded-square': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { tag: 'rect', attrs: { x: 0, y: 0, width: 100, height: 100, rx: 13, fill: '#0170C2' } },
            decorations: [
                { tag: 'rect', attrs: { x: 14, y: 72, width: 72, height: 5, fill: '#E48837' } }
            ],
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: '#fff',
                fontSizeByCodeLength: [{ max: 1, value: 58 }, { max: 2, value: 52 }, { value: 31 }],
                textLengthByCodeLength: [{ max: 1, value: 34 }, { max: 2, value: 68 }, { value: 66 }],
                transform: 'translate(50 44) scale(1 0.8) translate(-50 -40)',
                y: 44
            }
        },
        'nippori-toneri': {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            shape: { custom: 'nipporiToneriFrame' },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: '#000',
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 40 }, { value: 29 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 50
            }
        },
        arakawa: {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            image: { brand: 'arakawa', fill: '#000', attrs: { x: 0, y: 0, width: 100, height: 100, preserveAspectRatio: 'xMidYMid meet' } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: '#000',
                fontSizeByCodeLength: [{ max: 1, value: 42 }, { max: 2, value: 34 }, { value: 26 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 52
            }
        },
        odakyu: {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            image: { brand: 'odakyu', fill: 'lineColor', attrs: { x: 0, y: 0, width: 100, height: 100, preserveAspectRatio: 'xMidYMid meet' } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: 'fillColor',
                fontSizeByCodeLength: [{ max: 1, value: 56 }, { max: 2, value: 46 }, { value: 34 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 52
            }
        },
        seibu: {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            image: { brand: 'seibu', fill: 'lineColor', attrs: { x: 0, y: 0, width: 100, height: 100, preserveAspectRatio: 'xMidYMid meet' } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: '#000',
                fontSizeByCodeLength: [{ max: 1, value: 48 }, { max: 2, value: 36 }, { value: 24 }],
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 32
            }
        },
        nex: {
            html: {
                rootStyle: {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    flex: '0 0 auto', userSelect: 'none', width: '25px', height: '25px', padding: '0',
                    border: '0', borderRadius: '0', background: 'transparent', color: 'inherit',
                    lineHeight: '0', letterSpacing: '0', fontSize: '', fontWeight: '', overflow: 'visible'
                }
            },
            svg: {
                attrs: { viewBox: '0 0 100 100', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false', role: 'img' },
                style: { display: 'block', overflow: 'visible' }
            },
            image: { brand: 'nex', fill: '', attrs: { x: 0, y: 0, width: 100, height: 100, preserveAspectRatio: 'xMidYMid meet' } },
            text: { hidden: true }
        }
    },
    stationBadge: {
        defaultDesign: 'split-rectangle',
        emptyRouteDesign: 'split-rectangle'
    },
    // To reuse the selected line-icon outer frame for a station badge design,
    // set `frame: { reuseLineIconFrame: true }` or `frame: { source: 'line-icon' }`.
    // Optional: `frame: { preset: 'circle-border' }` forces a specific line-icon frame.
    stationBadgeDesigns: {
        'split-rectangle': {
            classNames: {
                root: 'rw-station-code-badge',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(.+)$',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '3.5px',
                    height: '20px',
                    minWidth: '20px',
                    padding: '0 0.2em 0 0',
                    lineHeight: '1',
                    fontWeight: '700'
                },
                prefixStyle: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    alignSelf: 'stretch',
                    boxSizing: 'border-box',
                    paddingLeft: '2px',
                    paddingRight: '2px',
                    marginRight: '0.2em',
                    lineHeight: '1'
                },
                suffixStyle: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: '#000',
                    lineHeight: '1'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'borderColor',
                prefixText: 'readableOnPrefixBackground'
            },
            fontSizeByCodeLength: [
                { max: 2, fontSize: '11px', letterSpacing: '0px' },
                { max: 4, fontSize: '10px', letterSpacing: '0px' },
                { fontSize: '9px', letterSpacing: '0px' }
            ]
        },
        'jr-east-station-square': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--jr-east',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3px',
            frame: { reuseLineIconFrame: true },
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '4px',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#000',
                    fontSize: '7px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y:'7px',
                    transform:'scaleY(1.1)'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '12px',
                    lineHeight: '0.92',
                    textAlign: 'center',
                    y: '16px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'Choshi-station':{
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--jr-east',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '1px',
            frame: { reuseLineIconFrame: true },
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '4px',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#000',
                    fontSize: '9px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y:'5px',
                    transform:'scaleY(1.1)'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '16px',
                    lineHeight: '0.92',
                    textAlign: 'center',
                    y: '16px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'tobu-rounded-square-station': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--tobu-rounded',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3px',
            frame: { reuseLineIconFrame: true },
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '4px',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#000',
                    fontSize: '7px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y:'8px',
                    transform:'scaleY(1.1)'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '9px',
                    lineHeight: '0.92',
                    textAlign: 'center',
                    y: '16px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'nippori-toneri-station':{
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--tobu-rounded',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3px',
            frame: { reuseLineIconFrame: true },
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '4px',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#000',
                    fontSize: '6.5px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y:'9px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '9px',
                    lineHeight: '0.92',
                    textAlign: 'center',
                    y: '16px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'jr-central-station-square': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--jr-central',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '1px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '0',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    width: '100%',
                    height: '10px',
                    margin: '0',
                    padding: '0',
                    color: '#fff',
                    fontSize: '10px',
                    lineHeight: '1',
                    textAlign: 'center',
                    fontWeight: '400',
                },
                suffixStyle: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    width: '100%',
                    flex: '1 1 auto',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '15px',
                    lineHeight: '1',
                    textAlign: 'center'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'lineColor',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '10px', letterSpacing: '0px' },
                { fontSize: '9px', letterSpacing: '0px' }
            ]
        },
        'seibu-station':{
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--seibu',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '2px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: 'lineColor',
                    color: '#fff',
                    borderRadius: '5px',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '0',
                    lineHeight: '1',
                    fontWeight: '900'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    height: '9px',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: '900',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y: '6px',
                    textLength: '10px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: '#fff',
                    borderTopLeftRadius: '0',
                    borderTopRightRadius: '0',
                    borderBottomRightRadius: '4px',
                    borderBottomLeftRadius: '4px',
                    color: '#000',
                    fontSize: '12px',
                    fontWeight: '900',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '17.5px',
                    textLength: '15px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'subway-station-roundel': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--subway-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#000',
                    fontSize: '9px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    transform:'scaleY(0.9)',
                    y: '9px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '10px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y:'16px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 3, fontSize: '10px', letterSpacing: '0px' },
                { fontSize: '9px', letterSpacing: '0px' }
            ]
        },
        'yokohama-subway-station-roundel': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--subway-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: 'fillColor',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '9px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y: '7px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#fff',
                    fontSize: '12px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y:'17px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 3, fontSize: '10px', letterSpacing: '0px' },
                { fontSize: '9px', letterSpacing: '0px' }
            ]
        },
        'arakawa-station': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--subway-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3px',
            frame: { reuseLineIconFrame: true },
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: 'fillColor',
                    color: '#000',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#000',
                    fontSize: '6.1px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y: '8.2px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '11px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y:'16px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 3, fontSize: '10px', letterSpacing: '0px' },
                { fontSize: '9px', letterSpacing: '0px' }
            ]
        },
        'twr-station-roundel': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--twr-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '0',
            frame: { reuseLineIconFrame: true },
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '0',
                    lineHeight: '1',
                    fontWeight: '900'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    height: '8px',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '7px',
                    fontWeight: '900',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '8px',
                    transform:'scaleY(1.1)'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: '900',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '14px',
                    transform:'scaleY(1.1)'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'yurikamome-station-roundel': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--yurikamome-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '0',
            frameDecorations: [
                { tag: 'circle', attrs: { cx: 12.5, cy: 12.5, r: 11.3, fill: 'none', stroke: '#fff', 'stroke-width': 1.2 } }
            ],
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#0286CE',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '0',
                    lineHeight: '1',
                    fontWeight: '900'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    height: '11px',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '8px',
                    fontWeight: '900',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '6.5px',
                    textLength: '9px',
                    transform: 'translate(12.5 6.3) skewX(-5) translate(-12.5 -6.3)'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    borderTopWidth: '2px',
                    borderTopColor: '#e60012',
                    borderTopInset: '1.4px',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: '900',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '17.5px',
                    textLength: '12px',
                    transform: 'translate(13 18.4) skewX(-5) translate(-13 -18.4)'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'circle-thin-station': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--private-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '2px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#000',
                    fontSize: '9px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y:'8px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '11px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '17px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'saitama-railway-circle-thin-station':{
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--private-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '4px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#000',
                    fontSize: '8px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y:'9px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '9px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '16px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'toyorapid-circle-thin-station':{
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--private-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '2px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#000',
                    fontSize: '9px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y:'8px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '11px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '17px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'chiba-monorail-station': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--private-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '2px',
            borderColor: '#0298CF',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: 'fillColor',
                    fontSize: '7px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y: '6px',
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: 'fillColor',
                    fontSize: '14px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '15px',
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: 'fillColor'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'keisei-station': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--private-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: 'fillColor',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: 'fillColor',
                    fontSize: '6.5px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y: '6px',
                    x:'16px',                    
                    transform: 'scale(0.8, 1.2)',
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: 'fillColor',
                    fontSize: '12px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '16px',
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: 'fillColor'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'odakyu-station': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--odakyu',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '2px',
            frame: { reuseLineIconFrame: true },
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: 'fillColor',
                    fontSize: '7px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y:'8px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: 'fillColor',
                    fontSize: '12px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y:'16px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: 'fillColor'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'sotetsu-station': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--sotetsu',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '0',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#0170C2',
                    color: '#fff',
                    borderRadius: '5px',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '0',
                    lineHeight: '1',
                    fontWeight: '900'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    height: '10px',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: '900',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '5.5px',
                    textLength: '18px',
                    transform: 'translate(12.5 6.8) scale(0.85 0.86) translate(-12.5 -6.8)'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    borderTopWidth: '2px',
                    borderTopColor: '#E48837',
                    borderTopInset: '2px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '900',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '18px',
                    textLength: '18px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'keikyu-station': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--keikyu',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#03346E',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#03346E',
                    fontSize: '7px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y:'8px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#03346E',
                    fontSize: '12px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y:'16px',
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'keio-circle-thin-border-station': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--private-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '4px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: 'lineColor',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '0',
                    lineHeight: '1',
                    fontWeight: '900'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    height: '7px',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '8px',
                    fontWeight: '900',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y: '6.5px',
                    x: '14px',
                    transform:'scaleX(0.9)'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: '#fff',
                    color: '#000',
                    fontSize: '13px',
                    fontWeight: '900',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '18.5px',
                    textWidth: '15px',
                    transform:'scaleY(0.9)'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'numeric-station-roundel': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--numeric-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]*)(\\d+)$',
            borderWidth: '4px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '0',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'none',
                    width: '0',
                    height: '0',
                    margin: '0',
                    padding: '0'
                },
                suffixStyle: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    width: '100%',
                    height: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '14px',
                    lineHeight: '1',
                    textAlign: 'center'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#000'
            },
            fontSizeByCodeLength: [
                { max: 2, fontSize: '15px', letterSpacing: '0px' },
                { fontSize: '13px', letterSpacing: '0px' }
            ]
        },
        'yokohama-seaside-station-roundel': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--yokohama-seaside-roundel',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]*)(\\d+)$',
            borderWidth: '0',
            frameDecorations: [
                {
                    tag: 'path',
                    attrs: {
                        d: 'M 3.2 18.1 C 4.9 18.1 6.0 19.0 7.6 19.0 C 9.3 19.0 10.2 18.2 12.4 18.2 C 14.6 18.2 15.5 19.12 17.3 19.12 C 19.2 19.12 20.1 18.0 21.8 18.0 C 22.4 18.0 22.9 18.22 23.25 18.55 A 10.95 10.95 0 0 1 12.5 23.65 A 10.95 10.95 0 0 1 3.2 18.1 Z',
                        fill: '#fff',
                        transform: 'translate(-0.6 0)'
                    }
                },
                { tag: 'circle', attrs: { cx: 12.5, cy: 12.5, r: 11.35, fill: 'none', stroke: '#fff', 'stroke-width': 0.8 } },
                {
                    tag: 'text',
                    attrs: {
                        x: 12.15,
                        y: 20.45,
                        fill: '#3B2477',
                        'font-family': 'Arial, Helvetica, sans-serif',
                        'font-size': 2.25,
                        'font-weight': 800,
                        'text-anchor': 'middle',
                        'dominant-baseline': 'central',
                        lengthAdjust: 'spacingAndGlyphs',
                        textLength: 15.2
                    },
                    text: 'Seaside Line'
                }
            ],
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#3B2477',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '0',
                    lineHeight: '1',
                    fontWeight: '900'
                },
                prefixStyle: {
                    display: 'none',
                    width: '0',
                    height: '0',
                    margin: '0',
                    padding: '0'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    height: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '15px',
                    fontWeight: '900',
                    lineHeight: '1',
                    textAlign: 'center',
                    y: '10.5px',
                    textLength: '8px'
                }
            },
            colors: {
                border: '#3B2477',
                prefixBackground: 'transparent',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 1, fontSize: '15px', letterSpacing: '0px' },
                { max: 2, fontSize: '13px', letterSpacing: '0px' },
                { fontSize: '10px', letterSpacing: '0px' }
            ]
        },
        'hexagon-station-badge': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--hexagon',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3px',
            frame: { reuseLineIconFrame: true },
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: 'lineColor',
                    color: '#fff',
                    borderRadius: '0',
                    clipPath: 'polygon(50% 0%, 92% 24%, 92% 76%, 50% 100%, 8% 76%, 8% 24%)',
                    width: '25px',
                    height: '23px',
                    minWidth: '25px',
                    padding: '3px 3px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '8px',
                    lineHeight: '0.95',
                    textAlign: 'center'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#fff',
                    fontSize: '12px',
                    lineHeight: '0.9',
                    textAlign: 'center'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '8px', letterSpacing: '0px' },
                { fontSize: '7px', letterSpacing: '0px' }
            ]
        },
        'saitama-transit-station-hexagon': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--saitama-transit',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '0',
            frame: { reuseLineIconFrame: true },
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    borderRadius: '0',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '0',
                    lineHeight: '1',
                    fontWeight: '900'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '8px',
                    fontWeight: '900',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y: '8px',
                    textLength: '14px'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: '900',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '17px',
                    textLength: '15px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'monochrome-top-band-square': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--monochrome-top-band',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    color: '#000',
                    borderRadius: '2px',
                    width: '29px',
                    height: '29px',
                    minWidth: '29px',
                    padding: '0',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    width: '100%',
                    height: '10px',
                    margin: '0',
                    padding: '0',
                    color: '#fff',
                    fontSize: '8px',
                    lineHeight: '1',
                    textAlign: 'center'
                },
                suffixStyle: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    width: '100%',
                    flex: '1 1 auto',
                    margin: '0',
                    padding: '0',
                    color: '#000',
                    fontSize: '14px',
                    lineHeight: '1',
                    textAlign: 'center'
                }
            },
            colors: {
                border: '#111',
                prefixBackground: '#111',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '8px', letterSpacing: '0px' },
                { fontSize: '7px', letterSpacing: '0px' }
            ]
        },
        'solid-stacked-rounded-square': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--solid-stacked-square',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3.5px',
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: 'lineColor',
                    color: '#fff',
                    borderRadius: '5px',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '9px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y: '7px',
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#fff',
                    fontSize: '13px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '17px',
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        },
        'minatomirai-station': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--minatomirai',
                prefix: 'rw-station-code-badge-prefix',
                suffix: 'rw-station-code-badge-suffix'
            },
            splitPattern: '^([A-Za-z]+)(\\d+)$',
            borderWidth: '3.5px',
            frameDecorations: [
                {
                    tag: 'path',
                    attrs: {
                        fill: '#0095b5',
                        transform: 'matrix(0.025 0 0 0.021 0 -8)',
                        d: 'm 709.77914,781.58463 c -41.553,-2.4118 -90.83353,-11.50303 -199.2386,-36.75536 C 402.643,719.69515 372.61661,713.90381 334.50747,710.87689 c -54.99795,-4.36836 -134.65996,7.44076 -256.928578,38.08719 -23.249142,5.82736 -42.469124,10.39725 -42.711071,10.1553 -0.241947,-0.24194 11.05241,-5.35142 25.098573,-11.35439 102.616896,-43.85579 198.471346,-75.78141 257.605636,-85.79904 23.92781,-4.05348 38.9418,-4.90635 64.57691,-3.66829 46.16475,2.22956 84.70649,7.03429 210.95758,26.29859 119.09373,18.17218 147.68903,20.93075 207.08128,19.97705 52.32032,-0.84014 96.47531,-5.76849 150.93181,-16.84622 8.28646,-1.68566 15.22929,-2.90184 15.4285,-2.70263 0.61043,0.61043 -13.27962,13.30982 -23.16819,21.18218 -40.28923,32.0746 -85.8963,53.96218 -139.15442,66.78253 -34.48474,8.30119 -59.80871,10.6059 -94.44636,8.59547 z'
                    }
                }
            ],
            html: {
                rootStyle: {
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    overflow: 'hidden',
                    backgroundColor: 'lineColor',
                    color: '#fff',
                    borderRadius: '2px',
                    width: '25px',
                    height: '25px',
                    minWidth: '25px',
                    padding: '3px 2px 2px',
                    lineHeight: '1',
                    fontWeight: '800'
                },
                prefixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    fontSize: '7px',
                    lineHeight: '0.95',
                    textAlign: 'center',
                    y: '5px',
                    transform:'scaleY(0.8)'
                },
                suffixStyle: {
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    margin: '0',
                    padding: '0',
                    color: '#fff',
                    fontSize: '15px',
                    lineHeight: '0.9',
                    textAlign: 'center',
                    y: '16px'
                }
            },
            colors: {
                border: 'lineColor',
                prefixBackground: 'transparent',
                prefixText: '#fff'
            },
            fontSizeByCodeLength: [
                { max: 4, fontSize: '9px', letterSpacing: '0px' },
                { fontSize: '8px', letterSpacing: '0px' }
            ]
        }
    }
};
