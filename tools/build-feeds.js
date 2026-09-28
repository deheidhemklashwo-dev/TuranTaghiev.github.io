/* feed.xml ve sitemap.xml üreteci. Tek kaynak: index.html'deki ANALYSES dizisi.

   Elle çalıştırmak gerekmez: GitHub Actions çalıştırır.
     .github/workflows/feeds-update.yml → her gün yeniden üretir, değişiklik varsa PR açar
     .github/workflows/feeds-check.yml  → PR'larda --check

   Kullanım (repo kökünden):
     node tools/build-feeds.js           → iki dosyayı yeniden yazar
     node tools/build-feeds.js --check   → yalnızca gerçek tutarsızlıkta çıkış kodu 1
                                           (yayın günü gelmiş ama eklenmemiş zamanlanmış yazı tutarsızlık sayılmaz)
     node tools/build-feeds.js --date=2026-10-02   → "bugün"ü sabitle (FEEDS_DATE ortam değişkeni de olur)

   Kurallar sitedeki davranışla aynı:
   - Yalnızca yayındaki yazılar: draft/archived değil, publishAt'i gelmiş (isLive).
   - Bağlantı: page varsa bağımsız sayfa, yoksa ?read=slug (slugFor ile aynı türetme).
   - pubDate = added; sıra added'a göre yeniden eskiye, eşitlikte dizideki sıra korunur.
   - guid = İngilizce başlık (mevcut okuyucuların öğeleri yeniden "yeni" görmemesi için).

   Çekirdek (build) hem Node'da hem tarayıcıda çalışır; tarayıcıda window.buildFeeds olarak açılır. */
(function(root){
  const SITE="https://deheidhemklashwo-dev.github.io/TuranTaghiev.github.io/";
  const CHANNEL_TITLE="Turan Taghiev — Selected Writing";
  const CHANNEL_DESC="Field notes and analysis on content moderation, community operations, and platform governance.";
  const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function slugFor(a){
    if(a.pdf)return a.pdf.replace(/^pdfs\//,"").replace(/\.pdf$/,"");
    return (a.title.en||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60);
  }
  function isLive(a,today){
    const scheduled=!a.draft&&a.publishAt&&a.publishAt>today;
    return !a.draft&&!a.archived&&!scheduled;
  }
  function xmlEsc(s){
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function rfc822(iso){
    const [y,m,d]=iso.split("-").map(Number);
    const t=new Date(Date.UTC(y,m-1,d));
    return `${DAYS[t.getUTCDay()]}, ${String(d).padStart(2,"0")} ${MONTHS[m-1]} ${y} 00:00:00 +0000`;
  }
  function urlFor(a){ return a.page?SITE+a.page:SITE+"?read="+slugFor(a); }
  function readable(a){ return !!(a.page||(a.body&&a.body.en)); }

  function build(ANALYSES,today){
    const live=ANALYSES
      .map((a,i)=>({a,i}))
      .filter(x=>isLive(x.a,today)&&readable(x.a)&&x.a.added)
      .sort((p,q)=>q.a.added<p.a.added?-1:q.a.added>p.a.added?1:p.i-q.i)
      .map(x=>x.a);

    const items=live.map(a=>{
      const desc=a.abstract&&a.abstract.en?`\n      <description>${xmlEsc(a.abstract.en)}</description>`:"";
      return `    <item>
      <title>${xmlEsc(a.title.en)}</title>
      <link>${xmlEsc(urlFor(a))}</link>
      <guid isPermaLink="false">${xmlEsc(a.title.en)}</guid>
      <pubDate>${rfc822(a.added)}</pubDate>${desc}
    </item>`;
    }).join("\n");

    const feed=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEsc(CHANNEL_TITLE)}</title>
    <link>${SITE}</link>
    <description>${xmlEsc(CHANNEL_DESC)}</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;

    /* sitemap: #fragment adresleri arama motorları için anlamsız (aynı sayfa), yalnızca gerçek adresler */
    const newest=live.length?live[0].added:today;
    const urls=[`  <url><loc>${SITE}</loc><lastmod>${newest}</lastmod></url>`]
      .concat(live.map(a=>`  <url><loc>${xmlEsc(urlFor(a))}</loc><lastmod>${a.added}</lastmod></url>`));
    const sitemap=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
    return {feed,sitemap,count:live.length};
  }

  /* index.html'den ANALYSES dizisini çıkar. Yardım metninde de "const ANALYSES = [" geçtiği için
     satır başına sabitlenir; kapanış satır başındaki "];". */
  function extractAnalyses(html){
    const h=/\r?\nconst ANALYSES = /.exec(html);
    if(!h)throw new Error("ANALYSES bulunamadı");
    const start=h.index+h[0].length;
    const e=/\r?\n\];/.exec(html.slice(start));
    if(!e)throw new Error("ANALYSES kapanışı bulunamadı");
    return new Function("return ("+html.slice(start,start+e.index)+"\n]);")();
  }

  /* "Gerçek tutarsızlık" mı, yoksa yalnızca yayın günü geldi mi?
     Dosyalar ANALYSES'in bugünkü ya da yayın günü gelmiş bir zamanlanmış yazıdan bir gün
     önceki haliyle birebir eşleşiyorsa tutarlıdır: aradaki fark yalnızca takvimdir ve onu
     günlük bot kapatır. Hiçbir tarihle eşleşmiyorsa içerik değişmiş ama dosyalar üretilmemiştir. */
  function dayBefore(iso){
    const [y,m,d]=iso.split("-").map(Number);
    return new Date(Date.UTC(y,m-1,d-1)).toISOString().slice(0,10);
  }
  function check(ANALYSES,today,current){
    const dates=[today].concat(
      [...new Set(ANALYSES.filter(a=>a.publishAt&&a.publishAt<=today).map(a=>dayBefore(a.publishAt)))].sort().reverse()
    );
    let stale=["feed.xml","sitemap.xml"];
    for(const d of dates){
      const o=build(ANALYSES,d);
      const s=[["feed.xml",o.feed],["sitemap.xml",o.sitemap]].filter(([f,v])=>current[f]!==v).map(([f])=>f);
      if(!s.length)return {ok:true,date:d,stale:[]};
      if(d===today)stale=s;
    }
    return {ok:false,date:null,stale};
  }

  const api={build,check,extractAnalyses,slugFor,isLive};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.buildFeeds=api;

  if(typeof require!=="undefined"&&typeof module!=="undefined"&&require.main===module){
    const fs=require("fs"),path=require("path");
    const repo=path.resolve(__dirname,"..");
    const arg=k=>{const m=process.argv.find(x=>x.startsWith("--"+k));return m?(m.split("=")[1]||true):null;};
    const today=arg("date")||process.env.FEEDS_DATE||new Date().toISOString().slice(0,10);
    const html=fs.readFileSync(path.join(repo,"index.html"),"utf8");
    const A=extractAnalyses(html);
    const out=build(A,today);
    const files={"feed.xml":out.feed,"sitemap.xml":out.sitemap};
    if(arg("check")){
      const read=f=>{try{return fs.readFileSync(path.join(repo,f),"utf8").replace(/\r\n/g,"\n");}catch(e){return "";}};
      const r=check(A,today,{"feed.xml":read("feed.xml"),"sitemap.xml":read("sitemap.xml")});
      if(!r.ok){
        console.error(`Tutarsız (bugün=${today}): ${r.stale.join(", ")} ANALYSES ile eşleşmiyor.`);
        console.error("Bu PR'da yazı eklendi/değişti ama feed/sitemap yeniden üretilmedi.");
        process.exit(1);
      }
      if(r.date===today)console.log(`feed.xml ve sitemap.xml güncel (bugün=${today}, yayındaki yazı=${out.count}).`);
      else console.log(`Tutarlı; yalnızca ${r.date} itibarıyla (yayın günü gelen zamanlanmış yazı henüz eklenmedi, günlük bot PR'ı bunu yapar).`);
    } else {
      for(const f in files)fs.writeFileSync(path.join(repo,f),files[f]);
      console.log(`Yazıldı: feed.xml, sitemap.xml (bugün=${today}, yayındaki yazı=${out.count}).`);
    }
  }
})(typeof window!=="undefined"?window:globalThis);
