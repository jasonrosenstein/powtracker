// Probe: candidate mountains in resorts.json for each Intermaps slug, by keyword.
import { readFileSync } from 'node:fs'
const resorts = JSON.parse(readFileSync('public/data/resorts.json', 'utf8')).resorts.filter((r) => ['AT', 'CH', 'DE', 'IT', 'FR', 'LI'].includes(r.cc))
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss')
// slug: keywords, any of which may appear in the mountain's name (umlauts folded: ö -> o).
const slugs = {
  skiarlberg: ['arlberg', 'st. anton', 'lech', 'zurs'], warth_schroecken: ['warth'], soelden: ['solden'], obergurgl_hochgurgl: ['gurgl'], kitzski: ['kitzski', 'kitzbuhel'],
  zillertalarena: ['zillertal arena', 'zell am ziller', 'gerlos', 'konigsleiten'], mayrhofen: ['mayrhofen'], hintertuxer_gletscher: ['hintertux'], zillertal_3000: ['zillertal 3000', 'finkenberg', 'eggalm', 'rastkogel'],
  hochfuegen: ['hochfugen', 'hochzillertal', 'kaltenbach'], stubaier_gletscher: ['stubai'], silvretta_montafon: ['silvretta montafon'], montafon: ['montafon'], golm: ['golm'], gargellen: ['gargellen'],
  schladming_dachstein: ['schladming', 'planai', 'hauser kaibling', 'reiteralm', 'hochwurzen'], obertauern: ['obertauern'], zell_am_see: ['zell am see', 'schmitten'], kitzsteinhorn: ['kitzsteinhorn', 'kaprun'],
  skiwelt: ['skiwelt', 'wilder kaiser'], davos: ['davos', 'parsenn', 'jakobshorn', 'klosters'], saas_fee: ['saas-fee', 'saas fee'], arosa_lenzerheide: ['arosa', 'lenzerheide'], jungfrau: ['jungfrau', 'grindelwald', 'wengen', 'murren', 'kleine scheidegg'],
  gstaad: ['gstaad', 'saanenmoser', 'zweisimmen', 'schonried'], engelberg: ['engelberg', 'titlis'], les_4_vallees: ['4 vallees', 'verbier'], portes_du_soleil: ['portes du soleil', 'avoriaz', 'morzine', 'chatel', 'champery', 'les gets'],
  kronplatz: ['kronplatz', 'plan de corones'], nassfeld: ['nassfeld'], bad_kleinkirchheim: ['kleinkirchheim'], katschberg: ['katschberg'], silvretta_arena: ['ischgl', 'silvretta arena', 'samnaun'], nauders: ['nauders'], galtuer: ['galtur'],
  pitztaler_gletscher: ['pitztal'], axamer_lizum: ['axamer'], aletsch_arena: ['aletsch'], rauris: ['rauris'], turracher_hoehe: ['turracher'], gerlitzen: ['gerlitzen'], goldeck: ['goldeck'], moelltaler_gletscher: ['molltal'], heiligenblut: ['heiligenblut'],
  sillian: ['sillian', 'hochpustertal'], brandnertal: ['brandnertal'], diedamskopf: ['diedamskopf'], sonnenkopf: ['sonnenkopf'], glungezer: ['glungezer'], bergeralm: ['bergeralm'], zugspitz_arena: ['ehrwald', 'lermoos', 'zugspitz arena', 'grubigstein'],
  berwang: ['berwang'], venet: ['venet'], hochzeiger: ['hochzeiger'], tauplitz: ['tauplitz'], loser: ['loser'], kreischberg: ['kreischberg'], lachtal: ['lachtal'], stuhleck: ['stuhleck'], dachstein_west: ['dachstein west', 'gosau'], hinterstoder: ['hinterstoder'],
  wurzeralm: ['wurzeralm'], hochficht: ['hochficht'], corvatsch: ['corvatsch'], toggenburg: ['toggenburg', 'wildhaus', 'chaserrugg'], braunwald: ['braunwald'], hoch_ybrig: ['ybrig'], lauchernalp: ['lauchernalp'], graechen: ['grachen'], sulden: ['sulden', 'solda'],
  nebelhorn: ['nebelhorn'], sudelfeld: ['sudelfeld'], brauneck: ['brauneck'], feldberg: ['feldberg'],
}
for (const [slug, words] of Object.entries(slugs)) {
  const hits = resorts.filter((r) => words.some((w) => fold(r.n).includes(w)))
  console.log(`${slug.padEnd(22)} ${hits.map((r) => `${r.id} ${r.n.slice(0, 44)} (${r.cc}, ${r.li} lifts)`).join(' | ') || 'NO MATCH'}`)
}
