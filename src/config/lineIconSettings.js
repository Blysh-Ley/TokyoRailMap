export const lineIconSettings = {
    // Edit a company here first. Each company points to complete designs below.
    companies: [
        { key: 'JR-East', label: 'JR东日本', match: { routeIds: ['JR-East.NaritaExpress'] }, lineIcon: { design: 'nex' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'JR-East', label: 'JR东日本', match: { routePrefixes: ['JR-East.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'JR-Central', label: 'JR东海', match: { routePrefixes: ['JR-Central'] }, lineIcon: { design: 'rectangle' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'TokyoMetro', label: '东京地下铁', match: { routePrefixes: ['TokyoMetro.'] }, lineIcon: { design: 'circle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Toei', label: '都营交通/地下铁', match: { routeIds: ['Toei.NipporiToneri'] }, lineIcon: { design: 'nippori-toneri' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Toei', label: '都营交通/地下铁', match: { routeIds: ['Toei.Arakawa'] }, lineIcon: { design: 'arakawa' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Toei', label: '都营交通/地下铁', match: { routePrefixes: ['Toei.'] }, lineIcon: { design: 'circle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Keio', label: '京王电铁', match: { routePrefixes: ['Keio.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Tobu', label: '东武铁道', match: { routePrefixes: ['Tobu.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Tokyu', label: '东急电铁', match: { routePrefixes: ['Tokyu.'] }, lineIcon: { design: 'rectangle' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Seibu', label: '西武铁道', match: { routePrefixes: ['Seibu.'] }, lineIcon: { design: 'seibu' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Keikyu', label: '京急电铁', match: { routePrefixes: ['Keikyu.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Odakyu', label: '小田急电铁', match: { routePrefixes: ['Odakyu.'] }, lineIcon: { design: 'odakyu' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Keisei', label: '京成电铁', match: { routePrefixes: ['Keisei.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Sotetsu', label: '相模铁道', match: { routePrefixes: ['Sotetsu.'] }, lineIcon: { design: 'rectangle' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Hokuso', label: '北总铁道', match: { routePrefixes: ['Hokuso.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'MIR', label: '首都圈新都市铁道', match: { routePrefixes: ['MIR.'] }, lineIcon: { design: 'rectangle' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'TokyoMonorail', label: '东京单轨电车', match: { routePrefixes: ['TokyoMonorail.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'TWR', label: '东京临海高速铁道', match: { routeIds: ['TWR.Rinkai'] }, lineIcon: { design: 'circle' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Yurikamome', label: '新交通百合鸥', match: { routeIds: ['Yurikamome.Yurikamome'] }, lineIcon: { design: 'circle' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Disney', label: '迪士尼', match: { routePrefixes: ['Disney.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'YokohamaMunicipal', label: '横滨市营地下铁', match: { routePrefixes: ['YokohamaMunicipal.'] }, lineIcon: { design: 'circle' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'YokohamaSeaside', label: '横滨海岸线', match: { routePrefixes: ['YokohamaSeaside.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Minatomirai', label: '横滨高速铁道', match: { routeIds: ['Minatomirai.Minatomirai'] }, lineIcon: { design: 'rectangle' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'ChibaMonorail', label: '千叶都市单轨', match: { routePrefixes: ['ChibaMonorail.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'ToyoRapid', label: '东叶高速铁道', match: { routePrefixes: ['ToyoRapid.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Ryutetsu', label: '流铁', match: { routePrefixes: ['Ryutetsu.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Yamaman', label: '山万', match: { routePrefixes: ['Yamaman.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'SaitamaTransit', label: '埼玉新都市交通', match: { routePrefixes: ['SaitamaTransit.'] }, lineIcon: { design: 'hexagon' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'SaitamaRailway', label: '埼玉高速铁道', match: { routePrefixes: ['SaitamaRailway.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'TamaMonorail', label: '多摩都市单轨', match: { routePrefixes: ['TamaMonorail.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'ShonanMonorail', label: '湘南单轨电车', match: { routePrefixes: ['ShonanMonorail.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'KantoRailway', label: '关东铁道', match: { routePrefixes: ['KantoRailway.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Enoden', label: '江之岛电铁', match: { routeIds: ['Enoden.Enoden'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'UtsunomiyaLightRail', label: '宇都宫轻轨', match: { routePrefixes: ['UtsunomiyaLightRail.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'KashimaRinkai', label: '鹿岛临海铁道', match: { routePrefixes: ['KashimaRinkai.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Choshi', label: '铫子电气铁道', match: { routePrefixes: ['Choshi.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Isumi', label: '夷隅铁道', match: { routePrefixes: ['Isumi.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Fujikyu', label: '富士急行', match: { routePrefixes: ['Fujikyu.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Shibayama', label: '芝山铁道', match: { routePrefixes: ['Shibayama.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Kominato', label: '小凑铁道', match: { routePrefixes: ['Kominato.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Izukyu', label: '伊豆急行', match: { routePrefixes: ['Izukyu.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Hitachinaka', label: '常陆那珂海滨铁道', match: { routePrefixes: ['Hitachinaka.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'IzuHakone', label: '伊豆箱根铁道', match: { routePrefixes: ['IzuHakone.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'OdakyuHakone', label: '箱根登山铁道', match: { routePrefixes: ['OdakyuHakone.'] }, lineIcon: { design: 'odakyu' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Chichibu', label: '秩父铁道', match: { routePrefixes: ['Chichibu.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Moka', label: '真冈铁道', match: { routePrefixes: ['Moka.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'split-rectangle' } }
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
                textLengthByCodeLength: [{ max: 1, value: 32 }, { max: 2, value: 50 }, { value: 66 }],
                y: 52
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
                y: 50
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
                fontSizeByCodeLength: [{ max: 1, value: 63 }, { max: 2, value: 53 }, { value: 34 }],
                textLengthByCodeLength: [{ max: 1, value: 38 }, { max: 2, value: 58 }, { value: 72 }],
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
        }
    }
};
