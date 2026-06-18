export const lineIconSettings = {
    // Edit a company here first. Each company points to complete designs below.
    companies: [
        { key: 'JR-East', label: 'JR东日本', match: { routeIds: ['JR-East.NaritaExpress'] }, lineIcon: { design: 'nex' }, stationBadge: { design: 'jr-east-station-square' } },
        { key: 'JR-East', label: 'JR东日本', match: { routePrefixes: ['JR-East.'] }, lineIcon: { design: 'jr-east-square' }, stationBadge: { design: 'jr-east-station-square' } },
        { key: 'JR-Central', label: 'JR东海', match: { routePrefixes: ['JR-Central'] }, lineIcon: { design: 'jr-central-rectangle' }, stationBadge: { design: 'jr-central-station-square' } },
        { key: 'TokyoMetro', label: '东京地下铁', match: { routePrefixes: ['TokyoMetro.'] }, lineIcon: { design: 'circle-border' }, stationBadge: { design: 'subway-station-roundel' } },
        { key: 'Toei', label: '都营交通/地下铁', match: { routeIds: ['Toei.NipporiToneri'] }, lineIcon: { design: 'nippori-toneri' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Toei', label: '都营交通/地下铁', match: { routeIds: ['Toei.Arakawa'] }, lineIcon: { design: 'arakawa' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Toei', label: '都营交通/地下铁', match: { routePrefixes: ['Toei.'] }, lineIcon: { design: 'circle-border' }, stationBadge: { design: 'subway-station-roundel' } },
        { key: 'Keio', label: '京王电铁', match: { routePrefixes: ['Keio.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'Tobu', label: '东武铁道', match: { routePrefixes: ['Tobu.'] }, lineIcon: { design: 'tobu-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'Tokyu', label: '东急电铁', match: { routePrefixes: ['Tokyu.'] }, lineIcon: { design: 'rectangle' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'Seibu', label: '西武铁道', match: { routePrefixes: ['Seibu.'] }, lineIcon: { design: 'seibu' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'Keikyu', label: '京急电铁', match: { routePrefixes: ['Keikyu.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'Odakyu', label: '小田急电铁', match: { routePrefixes: ['Odakyu.'] }, lineIcon: { design: 'odakyu' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'Keisei', label: '京成电铁', match: { routePrefixes: ['Keisei.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'Sotetsu', label: '相模铁道', match: { routePrefixes: ['Sotetsu.'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'Hokuso', label: '北总铁道', match: { routePrefixes: ['Hokuso.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'MIR', label: '首都圈新都市铁道', match: { routePrefixes: ['MIR.'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'TokyoMonorail', label: '东京单轨电车', match: { routePrefixes: ['TokyoMonorail.'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'TWR', label: '东京临海高速铁道', match: { routeIds: ['TWR.Rinkai'] }, lineIcon: { design: 'circle' }, stationBadge: { design: 'subway-station-roundel' } },
        { key: 'Yurikamome', label: '新交通百合鸥', match: { routeIds: ['Yurikamome.Yurikamome'] }, lineIcon: { design: 'circle' }, stationBadge: { design: 'subway-station-roundel' } },
        { key: 'Disney', label: '迪士尼', match: { routePrefixes: ['Disney.'] }, lineIcon: { design: 'hidden' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'YokohamaMunicipal', label: '横滨市营地下铁', match: { routePrefixes: ['YokohamaMunicipal.'] }, lineIcon: { design: 'circle' }, stationBadge: { design: 'subway-station-roundel' } },
        { key: 'YokohamaSeaside', label: '横滨海岸线', match: { routePrefixes: ['YokohamaSeaside.'] }, lineIcon: { design: 'hidden' }, stationBadge: { design: 'numeric-station-roundel' } },
        { key: 'Minatomirai', label: '横滨高速铁道', match: { routeIds: ['Minatomirai.Minatomirai'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'ChibaMonorail', label: '千叶都市单轨', match: { routePrefixes: ['ChibaMonorail.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'ToyoRapid', label: '东叶高速铁道', match: { routePrefixes: ['ToyoRapid.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'Ryutetsu', label: '流铁', match: { routePrefixes: ['Ryutetsu.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'Yamaman', label: '山万', match: { routePrefixes: ['Yamaman.'] }, lineIcon: { design: 'hidden' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'SaitamaTransit', label: '埼玉新都市交通', match: { routePrefixes: ['SaitamaTransit.'] }, lineIcon: { design: 'hexagon' }, stationBadge: { design: 'hexagon-station-badge' } },
        { key: 'SaitamaRailway', label: '埼玉高速铁道', match: { routePrefixes: ['SaitamaRailway.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'TamaMonorail', label: '多摩都市单轨', match: { routePrefixes: ['TamaMonorail.'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'ShonanMonorail', label: '湘南单轨电车', match: { routePrefixes: ['ShonanMonorail.'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'KantoRailway', label: '关东铁道', match: { routePrefixes: ['KantoRailway.'] }, lineIcon: { design: 'hidden' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Enoden', label: '江之岛电铁', match: { routeIds: ['Enoden.Enoden'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'UtsunomiyaLightRail', label: '宇都宫轻轨', match: { routePrefixes: ['UtsunomiyaLightRail.'] }, lineIcon: { design: 'hidden' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'KashimaRinkai', label: '鹿岛临海铁道', match: { routePrefixes: ['KashimaRinkai.'] }, lineIcon: { design: 'hidden' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Choshi', label: '铫子电气铁道', match: { routePrefixes: ['Choshi.'] }, lineIcon: { design: 'rectangle-border' }, stationBadge: { design: 'monochrome-top-band-square' } },
        { key: 'Isumi', label: '夷隅铁道', match: { routePrefixes: ['Isumi.'] }, lineIcon: { design: 'hidden' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Fujikyu', label: '富士急行', match: { routePrefixes: ['Fujikyu.'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'Shibayama', label: '芝山铁道', match: { routePrefixes: ['Shibayama.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'Kominato', label: '小凑铁道', match: { routePrefixes: ['Kominato.'] }, lineIcon: { design: 'hidden' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'Izukyu', label: '伊豆急行', match: { routePrefixes: ['Izukyu.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'Hitachinaka', label: '常陆那珂海滨铁道', match: { routePrefixes: ['Hitachinaka.'] }, lineIcon: { design: 'hidden' }, stationBadge: { design: 'split-rectangle' } },
        { key: 'IzuHakone', label: '伊豆箱根铁道', match: { routePrefixes: ['IzuHakone.'] }, lineIcon: { design: 'circle-thin-border' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'OdakyuHakone', label: '箱根登山铁道', match: { routePrefixes: ['OdakyuHakone.'] }, lineIcon: { design: 'odakyu' }, stationBadge: { design: 'private-rail-station-roundel' } },
        { key: 'Chichibu', label: '秩父铁道', match: { routePrefixes: ['Chichibu.'] }, lineIcon: { design: 'solid-rounded-square' }, stationBadge: { design: 'solid-stacked-rounded-square' } },
        { key: 'Moka', label: '真冈铁道', match: { routePrefixes: ['Moka.'] }, lineIcon: { design: 'hidden' }, stationBadge: { design: 'split-rectangle' } }
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
            shape: { tag: 'rect', attrs: { x: 7, y: 10, width: 86, height: 80, rx: 2, fill: 'fillColor' } },
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
            shape: { tag: 'rect', attrs: { x: 8, y: 8, width: 84, height: 84, rx: 16, fill: 'fillColor' } },
            text: {
                attrs: { x: 50, 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', lengthAdjust: 'spacingAndGlyphs' },
                color: { light: '#fff', dark: '#000' },
                fontSizeByCodeLength: [{ max: 1, value: 58 }, { max: 2, value: 47 }, { value: 31 }],
                textLengthByCodeLength: [{ max: 1, value: 36 }, { max: 2, value: 58 }, { value: 64 }],
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
                color: { light: '#fff', dark: '#000' },
                fontSizeByCodeLength: [{ max: 1, value: 58 }, { max: 2, value: 47 }, { value: 31 }],
                textLengthByCodeLength: [{ max: 1, value: 36 }, { max: 2, value: 58 }, { value: 64 }],
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
        },
        'jr-east-station-square': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--jr-east',
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
                    color: '#000',
                    fontSize: '13px',
                    lineHeight: '0.92',
                    textAlign: 'center'
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
                    fontSize: '9px',
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
        'subway-station-roundel': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--subway-roundel',
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
                    width: '32px',
                    height: '32px',
                    minWidth: '32px',
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
                    fontSize: '10px',
                    lineHeight: '0.95',
                    textAlign: 'center'
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
                    textAlign: 'center'
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
        'private-rail-station-roundel': {
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
                    width: '28px',
                    height: '28px',
                    minWidth: '28px',
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
                    textAlign: 'center'
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
                    textAlign: 'center'
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
        'hexagon-station-badge': {
            classNames: {
                root: 'rw-station-code-badge rw-station-code-badge--hexagon',
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
                    textAlign: 'center'
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
                    textAlign: 'center'
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
