/* Makale sayfaları üreteci: her yayındaki yazı için writing/<slug>.html (statik, JS'siz okunur).

   Neden: LinkedIn gibi bağlantı kazıyıcıları JavaScript çalıştırmaz. ?read=slug adresi onlara
   ana sayfanın başlığını ve açıklamasını gösterir. Bu sayfalar her yazının kendi başlığını,
   açıklamasını, canonical ve Open Graph etiketlerini sunucuda yazılı taşır.

   Kullanım (repo kökünden):
     node tools/build-pages.js            → writing/ klasörünü yeniden yazar (eskiyen sayfalar silinir)
     node tools/build-pages.js --check    → dosyalar güncel değilse çıkış kodu 1
     node tools/build-pages.js --date=2026-10-02   → "bugün"ü sabitle (PAGES_DATE ortam değişkeni de olur)

   Elle çalıştırmak gerekmez: .github/workflows/pages-build.yml PR dalına, feeds-update.yml
   günlük bot PR'ına üretir. writing/ klasöründeki dosyalar ELLE DÜZENLENMEZ.

   Kurallar:
   - Yalnızca yayındaki yazılar: draft/archived değil, publishAt'i gelmiş (feed'deki isLive ile aynı).
     Yayın günü gelmemiş yazının sayfası HİÇ üretilmez, bu yüzden main'e de girmez.
   - page: alanı olan girişler (elle yazılmış sayfalar) atlanır.
   - Yalnızca İngilizce. Gövde, okuyucunun kullandığı esc(smartType(...)) ile birebir aynı üretilir.
   - NDA: index.html'deki NDA_B64 listesindeki bir terim üretilen herhangi bir sayfada geçerse
     hiçbir şey yazılmaz, çıkış kodu 2.

   Çekirdek (buildAll) hem Node'da hem tarayıcıda çalışır; tarayıcıda window.buildPages olarak açılır. */
(function(root){
  const SITE="https://deheidhemklashwo-dev.github.io/TuranTaghiev.github.io/";
  const OUT_DIR="writing";
  const OG_IMAGE=SITE+"og-image.png";
  const LINKEDIN="https://www.linkedin.com/in/turan-t-b75a02290";
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const BIO="Writes on trust & safety, community operations, and platform governance, drawing on direct moderation and technical-support experience across multiple language communities.";
  const LANG_NAMES={tr:"Türkçe",ru:"Русский",az:"Azərbaycanca"};
  const SLUG_RE=/^[a-z0-9][a-z0-9-]*$/;

  /* ---- index.html'deki yardımcıların birebir kopyası (parite testi bunu doğrular) ---- */
  const esc=(s)=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function smartType(s){
    if(s==null)return "";
    return String(s)
      .replace(/(^|[\s([{\u2014\u2013-])"/g, "$1“")
      .replace(/"/g, "”")
      .replace(/(\w)'(\w)/g, "$1’$2")
      .replace(/(^|[\s([{])'/g, "$1‘")
      .replace(/'/g, "’");
  }
  function slugFor(a){
    if(!a)return "";
    if(a.pdf)return a.pdf.replace(/^pdfs\//,"").replace(/\.pdf$/,"");
    return (a.title.en||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60);
  }
  function isLive(a,today){
    const scheduled=!a.draft&&a.publishAt&&a.publishAt>today;
    return !a.draft&&!a.archived&&!scheduled;
  }

  function hasPage(a,today){
    return isLive(a,today)&&!a.page&&!!(a.body&&a.body.en&&a.body.en.trim());
  }
  function pagePath(a){ return OUT_DIR+"/"+slugFor(a)+".html"; }
  function pageUrl(a){ return SITE+OUT_DIR+"/"+slugFor(a)+".html"; }
  function fmtDate(iso){
    const p=String(iso||"").split("-").map(Number);
    if(p.length<3||p.some(isNaN))return "";
    return p[2]+" "+MONTHS[p[1]-1]+" "+p[0];
  }
  function readMins(a){
    const t=(a.body&&a.body.en)||"";
    return a.readMins||(t?Math.max(1,Math.round(t.trim().split(/\s+/).length/200)):0);
  }
  function paragraphs(a){
    return a.body.en.split(/\n\s*\n/).map(p=>esc(smartType(p.trim())));
  }
  function jsonLd(obj){
    return JSON.stringify(obj,null,2).replace(/</g,"\\u003c");
  }

  /* Eşitlik bozucu tohum: index.html'deki relSeed ile birebir aynı. Yazının dizideki yerine değil
     slug'ına bağlıdır; böylece başa yeni giriş eklemek ilgisiz sayfaların listesini değiştirmez.
     seeds = index.html'deki REL_SEED tablosu (mevcut yazıların dondurulmuş değerleri). */
  function relSeed(a,seeds){
    const s=slugFor(a);
    if(Object.prototype.hasOwnProperty.call(seeds,s))return seeds[s];
    let h=0;
    for(let k=0;k<s.length;k++)h=(h*31+s.charCodeAt(k))%9973;
    return h;
  }
  function extractRelSeed(html){
    const m=/\nconst REL_SEED=(\{[^}]*\});/.exec(html);
    if(!m)throw new Error("REL_SEED bulunamadı");
    return JSON.parse(m[1]);
  }

  /* renderRelated'ın (index.html) birebir portu: seri sırasındaki sonraki + konu yakınlığı */
  function relatedFor(A,idx,today,seeds){
    if(!seeds)throw new Error("relatedFor: REL_SEED tablosu verilmedi");
    const cur=A[idx];
    let seriesNext=null;
    if(cur.seriesId!=null&&cur.seriesOrder!=null){
      seriesNext=A.find(a=>a!==cur&&a.seriesId===cur.seriesId&&a.seriesOrder===cur.seriesOrder+1&&isLive(a,today))||null;
    }
    const related=A
      .map((a,i)=>({a,i}))
      .filter(({a,i})=>i!==idx&&isLive(a,today)&&a!==seriesNext&&a.topics.some(t=>cur.topics.includes(t)))
      .map(({a,i})=>{
        const ortak=a.topics.filter(t=>cur.topics.includes(t)).length;
        const ayniTur=(a.type&&cur.type&&a.type.en===cur.type.en)?1:0;
        const kaydirma=(relSeed(a,seeds)+relSeed(cur,seeds)*5)%13;
        return {a,i,puan:ortak*100+ayniTur*8+kaydirma};
      })
      .sort((x,y)=>(y.puan-x.puan)||(relSeed(x.a,seeds)-relSeed(y.a,seeds))||(slugFor(x.a)<slugFor(y.a)?-1:1))
      .slice(0,seriesNext?2:3)
      .map(x=>x.a);
    return seriesNext?[seriesNext,...related]:related;
  }
  function hrefFor(b,today){
    if(b.page)return "../"+b.page;
    if(hasPage(b,today))return slugFor(b)+".html";
    return "../index.html#read/"+slugFor(b);
  }

  function buildPage(A,idx,today,seeds){
    const a=A[idx], slug=slugFor(a), url=pageUrl(a);
    const title=a.title.en, abstract=(a.abstract&&a.abstract.en)||"";
    const type=(a.type&&a.type.en)||"";
    const topics=a.topics||[];
    const mins=readMins(a);
    const langs=["tr","ru","az"].filter(k=>a.body[k]&&a.body[k].trim());
    const rel=relatedFor(A,idx,today,seeds);
    const ld={
      "@context":"https://schema.org","@type":"Article",
      headline:title, description:abstract, datePublished:a.added||a.date, inLanguage:"en",
      author:{"@type":"Person",name:"Turan Taghiev",url:SITE,sameAs:[LINKEDIN]},
      url:url, mainEntityOfPage:{"@type":"WebPage","@id":url},
      image:OG_IMAGE, keywords:topics.join(", ")
    };
    if(topics[0])ld.articleSection=topics[0];
    const L=[];
    L.push('<!DOCTYPE html>');
    L.push('<html lang="en">');
    L.push('<head>');
    L.push('<meta charset="UTF-8" />');
    L.push('<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />');
    L.push('<title>'+esc(title)+' | Turan Taghiev</title>');
    L.push('<meta name="description" content="'+esc(abstract)+'" />');
    L.push('<link rel="canonical" href="'+esc(url)+'" />');
    L.push('<meta property="og:type" content="article" />');
    L.push('<meta property="og:site_name" content="Turan Taghiev" />');
    L.push('<meta property="og:locale" content="en_US" />');
    L.push('<meta property="og:title" content="'+esc(title)+'" />');
    L.push('<meta property="og:description" content="'+esc(abstract)+'" />');
    L.push('<meta property="og:url" content="'+esc(url)+'" />');
    L.push('<meta property="og:image" content="'+OG_IMAGE+'" />');
    L.push('<meta property="og:image:alt" content="Turan Taghiev: field notes and analysis on content moderation and platform governance" />');
    L.push('<meta property="og:image:width" content="1200" />');
    L.push('<meta property="og:image:height" content="630" />');
    if(a.added)L.push('<meta property="article:published_time" content="'+esc(a.added)+'" />');
    if(topics[0])L.push('<meta property="article:section" content="'+esc(topics[0])+'" />');
    topics.forEach(t=>L.push('<meta property="article:tag" content="'+esc(t)+'" />'));
    L.push('<meta name="twitter:card" content="summary_large_image" />');
    L.push('<meta name="twitter:title" content="'+esc(title)+'" />');
    L.push('<meta name="twitter:description" content="'+esc(abstract)+'" />');
    L.push('<meta name="twitter:image" content="'+OG_IMAGE+'" />');
    L.push('<script type="application/ld+json">');
    L.push(jsonLd(ld));
    L.push('</script>');
    L.push('<meta name="referrer" content="no-referrer" />');
    L.push('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; base-uri \'none\'; form-action \'none\'; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src \'self\' data:; script-src \'self\' \'unsafe-inline\'; connect-src \'none\'; object-src \'none\'; upgrade-insecure-requests" />');
    L.push('<meta http-equiv="X-Content-Type-Options" content="nosniff" />');
    L.push('<meta name="theme-color" content="#111315" />');
    L.push('<meta name="color-scheme" content="dark light" />');
    L.push('<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' rx=\'10\' fill=\'%23171a1d\'/%3E%3Ctext x=\'50%25\' y=\'52%25\' font-family=\'Georgia,serif\' font-size=\'38\' fill=\'%23b08d57\' text-anchor=\'middle\' dominant-baseline=\'central\'%3ET%3C/text%3E%3C/svg%3E" />');
    L.push('<script>(function(){try{var p=localStorage.getItem("site-theme")||"dark";var m=p;if(p==="system"){m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.setAttribute("data-theme",m);document.documentElement.setAttribute("data-theme-pref",p);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();</script>');
    L.push('<link rel="preconnect" href="https://fonts.googleapis.com" />');
    L.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />');
    L.push('<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Hanken+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />');
    L.push('<link rel="stylesheet" href="../assets/article.css" />');
    L.push('<noscript><style>.page-enter{opacity:1!important}</style></noscript>');
    L.push('</head>');
    L.push('<body class="page-enter">');
    L.push('<div class="progress" id="progress"></div>');
    L.push('<header>');
    L.push('  <nav class="nav">');
    L.push('    <a href="../index.html" class="brand">TURAN<b>.</b>TAGHIEV</a>');
    L.push('    <div class="nav-right">');
    L.push('      <a href="../index.html#writing" class="back">← <span class="back-label">Back to writing</span></a>');
    L.push('      <button class="theme-toggle" id="themeToggle" type="button" aria-label="Theme" title="Theme">');
    L.push('        <svg class="ti ti-dark" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>');
    L.push('        <svg class="ti ti-light" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>');
    L.push('        <svg class="ti ti-system" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/></svg>');
    L.push('      </button>');
    L.push('    </div>');
    L.push('  </nav>');
    L.push('</header>');
    L.push('<main>');
    L.push('<article class="article">');
    L.push('  <div class="a-meta">');
    const meta=[fmtDate(a.added||a.date),type,topics.join(" · ")].filter(Boolean);
    L.push('    '+meta.map(x=>'<span>'+esc(x)+'</span>').join('<span class="dot"></span>')+(mins?'<span class="rm">'+mins+' min read</span>':''));
    L.push('  </div>');
    L.push('  <h1>'+esc(smartType(title))+'</h1>');
    if(abstract)L.push('  <p class="a-sub">'+esc(smartType(abstract))+'</p>');
    L.push('  <div class="a-actions">');
    if(a.pdf)L.push('    <a class="pdf-link" href="../'+esc(a.pdf)+'" target="_blank" rel="noopener"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>PDF</a>');
    L.push('    <a class="pdf-link" data-lang="en" href="../index.html#read/'+slug+'">Open in the interactive site</a>');
    L.push('  </div>');
    L.push('  <div class="body">');
    paragraphs(a).forEach(p=>L.push('    <p>'+p+'</p>'));
    L.push('  </div>');
    if(rel.length){
      L.push('  <nav class="related" aria-label="Related analysis">');
      L.push('    <div class="rr-label">Related analysis</div>');
      rel.forEach(b=>{
        L.push('    <a class="rr-item" href="'+esc(hrefFor(b,today))+'"><div class="rr-type">'+esc((b.type&&b.type.en)||"")+' · '+esc(b.topics[0]||"")+'</div><div class="rr-title">'+esc(b.title.en)+'</div></a>');
      });
      L.push('  </nav>');
    }
    L.push('  <div class="author">');
    L.push('    <div class="author-name">Turan Taghiev</div>');
    L.push('    <p class="author-bio">'+esc(BIO)+'</p>');
    L.push('    <a class="author-link" href="'+LINKEDIN+'" target="_blank" rel="noopener noreferrer">Get in touch</a>');
    L.push('  </div>');
    if(langs.length){
      L.push('  <div class="langs">Read in: '+langs.map(k=>'<a data-lang="'+k+'" href="../index.html#read/'+slug+'">'+LANG_NAMES[k]+'</a>').join(' ')+'</div>');
    }
    L.push('</article>');
    L.push('</main>');
    L.push('<div class="a-foot">');
    L.push('  <div class="a-foot-inner">');
    L.push('    <a href="../index.html#writing">← More writing</a>');
    L.push('    <span>© Turan Taghiev</span>');
    L.push('  </div>');
    L.push('</div>');
    L.push('<script>');
    L.push('(function(){');
    L.push('  var META={dark:"#111315",light:"#f4efe6"};');
    L.push('  function apply(pref){');
    L.push('    var mode=pref==="system"?((window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches)?"light":"dark"):pref;');
    L.push('    document.documentElement.setAttribute("data-theme",mode);');
    L.push('    document.documentElement.setAttribute("data-theme-pref",pref);');
    L.push('    var mc=document.querySelector(\'meta[name="theme-color"]\');if(mc)mc.setAttribute("content",META[mode]);');
    L.push('    try{localStorage.setItem("site-theme",pref);}catch(e){}');
    L.push('  }');
    L.push('  document.getElementById("themeToggle").addEventListener("click",function(){');
    L.push('    var cur=document.documentElement.getAttribute("data-theme-pref")||"dark";');
    L.push('    apply(cur==="dark"?"light":(cur==="light"?"system":"dark"));');
    L.push('  });');
    L.push('  /* dil bağlantıları: ana sayfadaki aynı anahtarı yazıp etkileşimli okuyucuya geçer */');
    L.push('  document.querySelectorAll("a[data-lang]").forEach(function(a){');
    L.push('    a.addEventListener("click",function(){try{localStorage.setItem("site-lang",a.getAttribute("data-lang"));}catch(e){}});');
    L.push('  });');
    L.push('  var tick=false;');
    L.push('  window.addEventListener("scroll",function(){');
    L.push('    if(tick)return;tick=true;');
    L.push('    requestAnimationFrame(function(){');
    L.push('      var max=document.documentElement.scrollHeight-window.innerHeight;');
    L.push('      document.getElementById("progress").style.width=(max>0?(window.scrollY/max)*100:0)+"%";');
    L.push('      tick=false;');
    L.push('    });');
    L.push('  },{passive:true});');
    L.push('  requestAnimationFrame(function(){document.body.classList.add("ready");});');
    L.push('})();');
    L.push('</script>');
    L.push('</body>');
    L.push('</html>');
    return L.join("\n")+"\n";
  }

  /* writing/ dizinine çıplak gidilince (ör. adres çubuğunda kırpılmış bağlantı) GitHub Pages
     siteyi 404 ile karşılar. Bu küçük sayfa oradan yazı listesine götürür. İndekslenmez. */
  function buildIndex(){
    const L=[];
    L.push('<!DOCTYPE html>');
    L.push('<html lang="en">');
    L.push('<head>');
    L.push('<meta charset="UTF-8" />');
    L.push('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
    L.push('<title>Writing | Turan Taghiev</title>');
    L.push('<meta name="robots" content="noindex, follow" />');
    L.push('<meta http-equiv="refresh" content="0; url=../index.html#writing" />');
    L.push('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'" />');
    L.push('<style>body{background:#111315;color:#a7aaa6;font:16px/1.6 Georgia,serif;padding:2rem}a{color:#b08d57}</style>');
    L.push('<script>location.replace("../index.html#writing");</script>');
    L.push('</head>');
    L.push('<body><p><a href="../index.html#writing">Go to the writing index</a></p></body>');
    L.push('</html>');
    return L.join("\n")+"\n";
  }

  function buildAll(A,today,seeds){
    const files={}, skipped=[], seen={};
    A.forEach((a,idx)=>{
      const slug=slugFor(a);
      if(a.page){ skipped.push({slug,reason:"page: girişi (elle yazılmış sayfa)"}); return; }
      if(!a.body||!a.body.en||!a.body.en.trim()){ skipped.push({slug,reason:"İngilizce gövde yok"}); return; }
      if(!isLive(a,today)){
        skipped.push({slug,reason:a.draft?"taslak":a.archived?"arşivli":"yayın günü gelmedi (publishAt "+a.publishAt+")"});
        return;
      }
      if(!SLUG_RE.test(slug))throw new Error("Geçersiz slug: "+JSON.stringify(slug));
      if(slug==="index")throw new Error("Ayrılmış slug: index (writing/index.html yönlendirme sayfasıdır)");
      if(seen[slug])throw new Error("Yinelenen slug: "+slug);
      seen[slug]=true;
      files[pagePath(a)]=buildPage(A,idx,today,seeds);
    });
    files[OUT_DIR+"/index.html"]=buildIndex();
    return {files,skipped};
  }

  /* ---- NDA: index.html'deki NDA_B64 listesi, qaScanEntry ile aynı eşleşme (küçük harfe çevrilmiş alt dize) ---- */
  function b64decode(x){
    if(typeof Buffer!=="undefined")return Buffer.from(x,"base64").toString("utf8");
    return decodeURIComponent(escape(atob(x)));
  }
  function extractNdaTerms(html){
    const m=/const NDA_B64=\[([^\]]*)\]/.exec(html);
    if(!m)throw new Error("NDA_B64 bulunamadı");
    return (m[1].match(/"([^"]*)"/g)||[]).map(s=>b64decode(s.slice(1,-1))).filter(Boolean);
  }
  function scanNda(files,terms){
    const bad=[];
    Object.keys(files).forEach(p=>{
      const low=files[p].toLowerCase();
      terms.forEach(t=>{ if(low.includes(t.toLowerCase()))bad.push({file:p,term:t}); });
    });
    return bad;
  }

  const feeds=(typeof module!=="undefined"&&module.exports&&typeof require!=="undefined")?require("./build-feeds.js"):root.buildFeeds;
  const api={buildAll,buildPage,relatedFor,relSeed,extractRelSeed,scanNda,extractNdaTerms,esc,smartType,slugFor,isLive,hasPage,pagePath,pageUrl,OUT_DIR};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.buildPages=api;

  if(typeof require!=="undefined"&&typeof module!=="undefined"&&require.main===module){
    const fs=require("fs"),path=require("path");
    const repo=path.resolve(__dirname,"..");
    const arg=k=>{const m=process.argv.find(x=>x.startsWith("--"+k));return m?(m.split("=")[1]||true):null;};
    const today=arg("date")||process.env.PAGES_DATE||new Date().toISOString().slice(0,10);
    const html=fs.readFileSync(path.join(repo,"index.html"),"utf8");
    const A=feeds.extractAnalyses(html);
    const out=buildAll(A,today,extractRelSeed(html));
    const bad=scanNda(out.files,extractNdaTerms(html));
    if(bad.length){
      console.error("NDA taraması BAŞARISIZ, hiçbir dosya yazılmadı:");
      bad.forEach(b=>console.error("  "+b.file+" → hassas terim bulundu"));
      process.exit(2);
    }
    const dir=path.join(repo,OUT_DIR);
    const existing=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/^[a-z0-9][a-z0-9-]*\.html$/.test(f)):[];
    const wanted=Object.keys(out.files).map(p=>path.basename(p));
    const nPages=wanted.filter(f=>f!=="index.html").length;
    const stale=existing.filter(f=>!wanted.includes(f));
    if(arg("check")){
      const problems=[];
      Object.keys(out.files).forEach(p=>{
        let cur=null;try{cur=fs.readFileSync(path.join(repo,p),"utf8").replace(/\r\n/g,"\n");}catch(e){}
        if(cur===null)problems.push("eksik: "+p);
        else if(cur!==out.files[p])problems.push("farklı: "+p);
      });
      stale.forEach(f=>problems.push("eskimiş (silinmeli): "+OUT_DIR+"/"+f));
      if(problems.length){
        console.error(`Sayfalar güncel değil (bugün=${today}):`);
        problems.forEach(x=>console.error("  "+x));
        process.exit(1);
      }
      console.log(`${nPages} yazı sayfası + index.html güncel (bugün=${today}); NDA taraması: ${wanted.length}/${wanted.length} dosya temiz.`);
    } else {
      fs.mkdirSync(dir,{recursive:true});
      Object.keys(out.files).forEach(p=>fs.writeFileSync(path.join(repo,p),out.files[p]));
      stale.forEach(f=>fs.unlinkSync(path.join(dir,f)));
      console.log(`Yazıldı: ${nPages} yazı sayfası + index.html, silinen: ${stale.length}, atlanan: ${out.skipped.length} (bugün=${today}); NDA taraması: ${wanted.length}/${wanted.length} dosya temiz.`);
      out.skipped.forEach(s=>console.log(`  atlandı: ${s.slug} (${s.reason})`));
    }
  }
})(typeof window!=="undefined"?window:globalThis);
