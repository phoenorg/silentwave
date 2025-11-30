(function(){
  const app = {
    ctx: null,
    master: null,
    compressor: null,
    eq: { bass:null, mid:null, treble:null },
    safeMode: true,
    tracks: [],
    sessionStart: null,
    timer: { id:null, end:0, minutes:0, fade:true },
  };

  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const btnPlayPause = $('#btnPlayPause');
  const btnStopAll = $('#btnStopAll');
  const masterVol = $('#masterVol');
  const intensity = $('#intensity');
  const eqBass = $('#eqBass'), eqMid = $('#eqMid'), eqTreble = $('#eqTreble');
  const safeModeSwitch = $('#safeMode');
  const builtInTracks = $('#builtInTracks');
  const userTracks = $('#userTracks');
  const fileInput = $('#fileInput');
  const loopUpload = $('#loopUpload');
  const toggleTheme = $('#toggleTheme');
  const sessionChip = $('#sessionChip');

  const timerMin = $('#timerMin'), timerMinLabel = $('#timerMinLabel');
  const fadeOut = $('#fadeOut');
  const btnStartTimer = $('#btnStartTimer'), btnCancelTimer = $('#btnCancelTimer'), timerRemain = $('#timerRemain');

  const presetName = $('#presetName'), presetList = $('#presetList');
  const btnSavePreset = $('#btnSavePreset'), btnLoadPreset = $('#btnLoadPreset'), btnDeletePreset = $('#btnDeletePreset');
  const btnExportPreset = $('#btnExportPreset'), btnImportPreset = $('#btnImportPreset'), presetImport = $('#presetImport');

  const LS_KEYS = {
    PRESETS: 'tinnitus_presets',
    THEME: 'tinnitus_theme',
    STATS: 'tinnitus_stats'
  };

  function ensureAudio(){
    if(app.ctx) return;
    app.ctx = new (window.AudioContext || window.webkitAudioContext)();
    app.master = app.ctx.createGain();
    app.compressor = app.ctx.createDynamicsCompressor();
    app.compressor.threshold.value = -24;
    app.compressor.knee.value = 20;
    app.compressor.ratio.value = 3;
    app.compressor.attack.value = 0.003;
    app.compressor.release.value = 0.25;

    app.eq.bass = app.ctx.createBiquadFilter(); app.eq.bass.type='lowshelf'; app.eq.bass.frequency.value = 150;
    app.eq.mid  = app.ctx.createBiquadFilter(); app.eq.mid.type='peaking';   app.eq.mid.frequency.value = 1000; app.eq.mid.Q.value=1;
    app.eq.treble = app.ctx.createBiquadFilter(); app.eq.treble.type='highshelf'; app.eq.treble.frequency.value = 4000;

    app.master.connect(app.eq.bass);
    app.eq.bass.connect(app.eq.mid);
    app.eq.mid.connect(app.eq.treble);
    app.eq.treble.connect(app.compressor);
    app.compressor.connect(app.ctx.destination);

    updateMasterGain();
    updateEQ();
  }

  function now(){ return performance.now(); }

  class Track {
    constructor({name, kind, createNode, loop=true}){
      this.name = name;
      this.kind = kind;
      this.loop = loop;
      this.gainNode = null;
      this.panner = null;
      this.source = null;
      this.media = null;
      this.buffer = null;
      this.ui = null;
      this.volume = 60;
      this.pan = 0;
      this.enabled = false;
      this.createNode = createNode;
    }

    connect(){
      ensureAudio();
      if(this.gainNode) return;
      this.gainNode = app.ctx.createGain();
      this.panner = app.ctx.createStereoPanner();
      this.gainNode.connect(this.panner);
      this.panner.connect(app.master);
      this.updateGain();
      this.updatePan();
    }

    start(){
      ensureAudio();
      this.connect();
      if(this.kind==='noise'){
        this.source = app.ctx.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.loop = true;
        this.source.connect(this.gainNode);
        this.source.start();
      } else if(this.kind==='audio'){
        if(!this.media){ console.warn('media element missing'); return; }
        if(!this.source){ this.source = app.ctx.createMediaElementSource(this.media); this.source.connect(this.gainNode); }
        this.media.loop = this.loop;
        this.media.play();
      }
      this.enabled = true;
      if(this.ui) this.ui.querySelector('.toggle').setAttribute('aria-pressed','true');
    }

    stop(){
      if(this.kind==='noise'){ try{ this.source && this.source.stop(); }catch(e){} }
      else if(this.kind==='audio'){ this.media && this.media.pause(); if(this.media){ this.media.currentTime = 0; } }
      this.enabled = false;
      if(this.ui) this.ui.querySelector('.toggle').setAttribute('aria-pressed','false');
    }

    updateGain(){
      if(!this.gainNode) return;
      const intensityFactor = parseInt(intensity.value,10)/100;
      const base = (this.volume/100);
      const safeLimit = app.safeMode ? 0.8 : 1.2;
      this.gainNode.gain.value = Math.min(base * intensityFactor, safeLimit);
    }

    updatePan(){ if(!this.panner) return; this.panner.pan.value = this.pan; }

    attachUI(container){
      const el = document.createElement('div');
      el.className='track';
      el.innerHTML = `
        <div class="row">
          <strong>${this.name}</strong>
          <div class="row" style="gap:6px">
            <button class="btn ghost toggle" aria-pressed="false">▶️</button>
            <button class="btn ghost stop">⏹️</button>
          </div>
        </div>
        <div class="controls">
          <div class="stack">
            <label>Volume</label>
            <input class="vol slider" type="range" min="0" max="100" value="${this.volume}">
          </div>
          <div class="stack">
            <label>Panoramique</label>
            <input class="pan slider" type="range" min="-100" max="100" value="${this.pan*100}">
          </div>
        </div>
      `;
      container.appendChild(el);
      this.ui = el;

      const btnT = el.querySelector('.toggle');
      const btnS = el.querySelector('.stop');
      const vol = el.querySelector('.vol');
      const pan = el.querySelector('.pan');

      btnT.addEventListener('click', async ()=>{
        ensureAudio(); await app.ctx.resume();
        if(this.enabled){ this.stop(); } else { this.start(); }
      });
      btnS.addEventListener('click', ()=> this.stop());
      vol.addEventListener('input', (e)=>{ this.volume = parseInt(e.target.value,10); this.updateGain(); });
      pan.addEventListener('input', (e)=>{ this.pan = parseInt(e.target.value,10)/100; this.updatePan(); });
    }
  }

  function createNoiseBuffer(seconds=5, shaper='white'){
    ensureAudio();
    const sr = app.ctx.sampleRate;
    const len = Math.max(1, Math.floor(seconds*sr));
    const buf = app.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for(let i=0;i<len;i++){ data[i] = Math.random()*2 - 1; }

    if(shaper==='pink'){ let last=0; const b0=0.997; for(let i=0;i<len;i++){ last=b0*last+(1-b0)*data[i]; data[i]=last; } normalize(data); }
    else if(shaper==='brown'){ let last=0; for(let i=0;i<len;i++){ last+=data[i]*0.02; last*=0.995; data[i]=last; } normalize(data); }
    else if(shaper==='rain'){ let last=0; for(let i=0;i<len;i++){ last=0.9*last+0.1*data[i]; const mod=0.5+0.5*Math.sin(2*Math.PI*i/12000)+0.2*Math.sin(2*Math.PI*i/3000); data[i]=(data[i]-last)*0.8*mod; } normalize(data); }
    else if(shaper==='wind'){ let last=0; for(let i=0;i<len;i++){ last=0.98*last+0.02*data[i]; const mod=0.6+0.4*Math.sin(2*Math.PI*i/20000); data[i]=last*mod; } }
    return buf;
  }
  function normalize(arr){ let max=0; for(let i=0;i<arr.length;i++){ max=Math.max(max, Math.abs(arr[i])); } if(max>0){ const k=1/max; for(let i=0;i<arr.length;i++){ arr[i]*=k; } } }

  function addBuiltIns(){
    const defs = [{name:'White noise',shape:'white'},{name:'Pink noise',shape:'pink'},{name:'Brown noise',shape:'brown'},{name:'Rain (experimental)',shape:'rain'},{name:'Wind (experimental)',shape:'wind'}];
    defs.forEach(d=>{
      const t = new Track({name:d.name,kind:'noise',createNode:()=>{},loop:true});
      t.buffer=createNoiseBuffer(6,d.shape);
      t.attachUI(builtInTracks);
      app.tracks.push(t);
    });
  }

  // MP3 upload
  fileInput.addEventListener('change', async (e)=>{
    const files = Array.from(e.target.files||[]);
    for(const f of files){
      const url = URL.createObjectURL(f);
      const media = new Audio(url);
      media.loop = loopUpload.checked; media.preload='auto';
      const t = new Track({name:f.name.replace(/\.[^/.]+$/,''),kind:'audio',createNode:()=>{},loop:loopUpload.checked});
      t.media = media;
      t.attachUI(userTracks);
      app.tracks.push(t);
      // Revoke URL when media is loaded
      media.addEventListener('loadeddata', ()=> URL.revokeObjectURL(url));
    }
    e.target.value='';
  });

  loopUpload.addEventListener('change', ()=>{
    // Apply looping to existing MP3 tracks
    app.tracks.filter(t=>t.kind==='audio').forEach(t=> t.loop = loopUpload.checked);
  });

  // Master controls
  function updateMasterGain(){
    ensureAudio();
    const vol=parseInt(masterVol.value,10)/100;
    const intensityFactor=parseInt(intensity.value,10)/100;
    const safeCap = app.safeMode?0.85:1.4;
    app.master.gain.value=Math.min(vol*intensityFactor, safeCap);
    app.tracks.forEach(t=>t.updateGain());
  }
  function updateEQ(){ ensureAudio(); app.eq.bass.gain.value=parseFloat(eqBass.value); app.eq.mid.gain.value=parseFloat(eqMid.value); app.eq.treble.gain.value=parseFloat(eqTreble.value); }

  masterVol.addEventListener('input', updateMasterGain);
  intensity.addEventListener('input', updateMasterGain);
  eqBass.addEventListener('input', updateEQ);
  eqMid.addEventListener('input', updateEQ);
  eqTreble.addEventListener('input', updateEQ);

  safeModeSwitch.addEventListener('change', (e)=>{ app.safeMode=e.target.checked; updateMasterGain(); });

  // Play All Tracks
  btnPlayPause.addEventListener('click', async ()=>{
    ensureAudio(); await app.ctx.resume();
    const anyEnabled = app.tracks.some(t=>t.enabled);
    if(!anyEnabled){
      // Start all
      app.tracks.forEach(t=> t.start());
      btnPlayPause.textContent='⏸️ Pause';
    } else {
      // Pause all
      app.tracks.forEach(t=>{
        if(t.kind==='audio' && t.media && !t.media.paused){ t.media.pause(); }
        if(t.kind==='noise' && t.enabled){ t.stop(); }
      });
      btnPlayPause.textContent='▶️ Continue';
    }
    if(!app.sessionStart) app.sessionStart=Date.now();
  });

  btnStopAll.addEventListener('click', ()=>{ app.tracks.forEach(t=>t.stop()); btnPlayPause.textContent='▶️ Start'; });

  setInterval(()=>{
    if(!app.sessionStart) return;
    const sec=Math.floor((Date.now()-app.sessionStart)/1000);
    sessionChip.textContent=formatHMS(sec);
  },1000);

  function formatHMS(sec){ const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60; const pad=n=>String(n).padStart(2,'0'); return `${pad(h)}:${pad(m)}:${pad(s)}`; }

  // Timer logic
  function updateTimerLabel(){ timerMinLabel.textContent=`${timerMin.value} min`; }
  timerMin.addEventListener('input', updateTimerLabel);
  updateTimerLabel();

  btnStartTimer.addEventListener('click', ()=>{
    ensureAudio();
    const minutes=parseInt(timerMin.value,10);
    app.timer.minutes=minutes; app.timer.fade=fadeOut.checked;
    app.timer.end=Date.now()+minutes*60*1000;
    if(app.timer.id) clearInterval(app.timer.id);
    app.timer.id=setInterval(()=>{
      const remainMs=app.timer.end-Date.now();
      if(remainMs<=0){ if(app.timer.fade){ fadeMasterOut(6000).then(()=>stopAll()); } else { stopAll(); } clearInterval(app.timer.id); app.timer.id=null; timerRemain.textContent='00:00'; }
      else{
        const remainSec=Math.round(remainMs/1000);
        const mm=Math.floor(remainSec/60), ss=remainSec%60;
        timerRemain.textContent=`${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
        if(app.timer.fade && remainSec<180){
          const frac=Math.max(0, remainSec/180); 
          app.master.gain.value = frac*(parseInt(masterVol.value,10)/100)*(parseInt(intensity.value,10)/100);
        }
      }
    },500);
  });

  btnCancelTimer.addEventListener('click', ()=>{
    if(app.timer.id){ clearInterval(app.timer.id); app.timer.id=null; }
    timerRemain.textContent='–'; updateMasterGain();
  });

  function fadeMasterOut(ms){
    return new Promise(res=>{
      ensureAudio(); const g=app.master.gain;
      try{ g.cancelScheduledValues(app.ctx.currentTime); g.setTargetAtTime(0.0001, app.ctx.currentTime, ms/1000); }catch(e){
        const start=g.value; const t0=performance.now();
        const iv=setInterval(()=>{ const p=Math.min(1,(performance.now()-t0)/ms); g.value=start*(1-p); if(p>=1){ clearInterval(iv); res(); } },50);
      }
      setTimeout(res,ms+50);
    });
  }
  function stopAll(){ app.tracks.forEach(t=>t.stop()); btnPlayPause.textContent='▶️ Démarrer'; }

  // Presets
  function loadPresets(){ const raw=localStorage.getItem(LS_KEYS.PRESETS); let arr=[]; try{ arr=raw?JSON.parse(raw):[]; }catch(e){ arr=[]; } presetList.innerHTML=''; arr.forEach((p,i)=>{ const opt=document.createElement('option'); opt.value=i; opt.textContent=p.name; presetList.appendChild(opt); }); return arr; }
  function savePresets(arr){ localStorage.setItem(LS_KEYS.PRESETS,JSON.stringify(arr)); loadPresets(); }
  function captureState(){ return { name: presetName.value||`Preset ${new Date().toLocaleString()}`, masterVol: parseInt(masterVol.value,10), intensity: parseInt(intensity.value,10), eq:{bass:parseFloat(eqBass.value),mid:parseFloat(eqMid.value),treble:parseFloat(eqTreble.value)}, safeMode: app.safeMode, tracks: app.tracks.map(t=>({name:t.name,kind:t.kind,volume:t.volume,pan:t.pan,enabled:t.enabled,loop:t.loop})) }; }
  function applyState(state){
    masterVol.value=state.masterVol; intensity.value=state.intensity; eqBass.value=state.eq.bass; eqMid.value=state.eq.mid; eqTreble.value=state.eq.treble;
    safeModeSwitch.checked=!!state.safeMode; app.safeMode=!!state.safeMode; updateEQ(); updateMasterGain();
    state.tracks.forEach(s=>{
      const t=app.tracks.find(x=>x.name===s.name && x.kind===s.kind); if(!t) return;
      t.volume=s.volume; t.pan=s.pan; t.updateGain(); t.updatePan();
      if(t.ui){ t.ui.querySelector('.vol').value=t.volume; t.ui.querySelector('.pan').value=t.pan*100; }
      if(s.enabled){ t.start(); } else { t.stop(); }
    });
  }

  btnSavePreset.addEventListener('click', ()=>{ const arr=loadPresets(); const state=captureState(); arr.push(state); savePresets(arr); });
  btnLoadPreset.addEventListener('click', ()=>{ const arr=loadPresets(); const idx=parseInt(presetList.value,10); if(isNaN(idx)) return; applyState(arr[idx]); });
  btnDeletePreset.addEventListener('click', ()=>{ const arr=loadPresets(); const idx=parseInt(presetList.value,10); if(isNaN(idx)) return; arr.splice(idx,1); savePresets(arr); });

  btnExportPreset.addEventListener('click', ()=>{
    const state=captureState();
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='preset.json'; a.click();
  });

  btnImportPreset.addEventListener('click', ()=>{ presetImport.click(); });
  presetImport.addEventListener('change',(e)=>{
    const f=e.target.files[0]; if(!f) return;
    const reader=new FileReader();
    reader.onload=()=>{ try{ const state=JSON.parse(reader.result); applyState(state); }catch(e){ console.warn(e); } };
    reader.readAsText(f); e.target.value='';
  });

  // Theme
  const theme = localStorage.getItem(LS_KEYS.THEME)||'light'; document.body.setAttribute('data-theme',theme);
  toggleTheme.addEventListener('click', ()=>{ const t=document.body.getAttribute('data-theme')==='dark'?'light':'dark'; document.body.setAttribute('data-theme',t); localStorage.setItem(LS_KEYS.THEME,t); });

  // Init
  addBuiltIns();
})();