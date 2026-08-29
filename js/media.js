/**
 * Media, Video & Animation Controller
 * Path: js/media.js
 */

let mobileVideosUnlocked = false;

// iOS & Mobile Autoplay Constraints Unlocker
function unlockMobileVideos() {
  if (mobileVideosUnlocked) return;

  const vids = document.querySelectorAll('video');
  vids.forEach(v => {
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    
    const p = v.play();
    if (p !== undefined) {
      p.then(() => {
        v.pause();
      }).catch(() => {});
    }
  });

  mobileVideosUnlocked = true;
}

// Orientation Resolver (P1 faces Right, P2 faces Left)
function getTransformFlip(player, playerKey, moveObj = null) {
  if (!player) return 'scaleX(1)';

  const nativeFacing = (moveObj && moveObj.sourceFacing) 
    ? moveObj.sourceFacing 
    : (player.sourceFacing || (player.id === 'nigo' ? 'right' : 'left'));

  let shouldFlip = false;
  if (nativeFacing === 'left') {
    shouldFlip = (playerKey === 'p1');
  } else {
    shouldFlip = (playerKey === 'p2');
  }

  if (moveObj && moveObj.unmirrored) {
    shouldFlip = !shouldFlip;
  }

  return shouldFlip ? 'scaleX(-1)' : 'scaleX(1)';
}

// Safe Non-Blocking Video Asset Preloader
async function preloadRiderVideos(riderId, riderMoves = {}) {
  if (!riderId) return;

  if (!window.gameState) window.gameState = {};
  if (!window.gameState.videoCache) window.gameState.videoCache = {};

  const baseVideoFiles = [
    'idle.mp4', 'mid-air.mp4', 'faint.mp4', 'ko.mp4', 'victory.mp4', 'victory2.mp4',
    'hit.mp4', 'hit_physical.mp4', 'guard.mp4', 'windmill_guard.mp4', 'dodge.mp4'
  ];

  const moveVideos = Object.values(riderMoves || {})
    .filter(m => m && typeof m === 'object' && m.video)
    .map(m => m.video);

  const videoFiles = Array.from(new Set([...baseVideoFiles, ...moveVideos]));

  videoFiles.forEach(file => {
    const rawUrl = `assets/videos/${riderId}/${file}`;
    window.gameState.videoCache[rawUrl] = rawUrl;
  });
}

// Action Cutscene Video Player (Center Box)
function playCenterVideo(playerKey, videoFile, actionName = '', maxDurationMs = null, moveObj = null) {
  return new Promise((resolve) => {
    unlockMobileVideos();

    const centerBox = document.getElementById('center-box') || document.getElementById('center-screen');
    const centerVid = document.getElementById('center-video');
    const actionLabel = document.getElementById('center-action-label') || document.getElementById('center-video-label');
    
    if (!centerBox || !centerVid) {
      resolve();
      return;
    }

    const player = window.gameState ? window.gameState[playerKey] : null;
    if (!player) {
      resolve();
      return;
    }

    if (actionLabel) {
      const slotPrefix = playerKey.toUpperCase();
      actionLabel.textContent = actionName ? `[${slotPrefix}] ${player.name} : ${actionName}!` : '';
      actionLabel.hidden = !actionName;
    }

    const isMirrorMatch = window.gameState.p1 && window.gameState.p2 && (window.gameState.p1.id === window.gameState.p2.id);

    centerBox.hidden = false;
    centerVid.muted = true;
    centerVid.playsInline = true;
    centerVid.setAttribute('playsinline', '');
    centerVid.setAttribute('webkit-playsinline', '');

    centerVid.classList.toggle('p2-mirror-palette', playerKey === 'p2' && isMirrorMatch);
    centerVid.style.transform = getTransformFlip(player, playerKey, moveObj);

    let resolved = false;
    let fallbackTimer = null;

    const cleanUpAndResolve = () => {
      if (resolved) return;
      resolved = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);

      centerVid.removeEventListener('ended', cleanUpAndResolve);
      centerVid.removeEventListener('error', cleanUpAndResolve);
      centerVid.removeEventListener('loadedmetadata', onMetadata);

      centerBox.hidden = true;
      if (actionLabel) actionLabel.hidden = true;
      resolve();
    };

    const onMetadata = () => {
      if (resolved) return;
      if (centerVid.duration && !isNaN(centerVid.duration) && centerVid.duration > 0) {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        const durationMs = (centerVid.duration * 1000) + 300;
        const targetTimeout = maxDurationMs ? Math.max(durationMs, maxDurationMs) : durationMs;
        fallbackTimer = setTimeout(cleanUpAndResolve, targetTimeout);
      }
    };

    centerVid.addEventListener('ended', cleanUpAndResolve);
    centerVid.addEventListener('error', cleanUpAndResolve);
    centerVid.addEventListener('loadedmetadata', onMetadata);

    const riderId = player.id || 'ichigo';
    const rawUrl = `assets/videos/${riderId}/${videoFile}`;
    const videoUrl = (window.gameState.videoCache && window.gameState.videoCache[rawUrl]) || rawUrl;

    centerVid.src = videoUrl;
    centerVid.load();

    const playPromise = centerVid.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        setTimeout(cleanUpAndResolve, 1200);
      });
    }

    const initialTimeout = (maxDurationMs && maxDurationMs > 2500) ? maxDurationMs : 2500;
    fallbackTimer = setTimeout(cleanUpAndResolve, initialTimeout);
  });
}

function hideCenterScreen() {
  const centerBox = document.getElementById('center-box') || document.getElementById('center-screen');
  const centerVid = document.getElementById('center-video');
  if (centerVid) {
    centerVid.pause();
    centerVid.removeAttribute('src');
  }
  if (centerBox) centerBox.hidden = true;
}

// Side Character Media Updater (Idle, Mid-Air, Faint, Victory, KO)
function updateCharacterMedia(playerKey, stateType) {
  if (!window.gameState) return;
  const player = window.gameState[playerKey];
  if (!player) return;

  const videoEl = document.getElementById(`${playerKey}-video`);
  const spriteEl = document.getElementById(`${playerKey}-sprite`);
  if (!videoEl) return;

  let fileName = stateType;

  if (stateType === 'IDLE') {
    if (player.isFainted) {
      fileName = 'faint.mp4';
    } else if (player.airborneTicks > 0) {
      fileName = 'mid-air.mp4';
    } else {
      fileName = 'idle.mp4';
    }
  } else if (stateType === 'VICTORY' || stateType === 'victory') {
    fileName = Math.random() < 0.5 ? 'victory.mp4' : 'victory2.mp4';
  } else if (stateType === 'KO' || stateType === 'ko') {
    fileName = 'ko.mp4';
  }

  if (!fileName.endsWith('.mp4') && !fileName.endsWith('.webm')) {
    fileName += '.mp4';
  }

  const moves = playerKey === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves;
  const currentMove = moves ? Object.values(moves).find(m => m && m.video === fileName) : null;

  videoEl.style.transform = getTransformFlip(player, playerKey, currentMove);

  const isMirrorMatch = window.gameState.p1 && window.gameState.p2 && (window.gameState.p1.id === window.gameState.p2.id);

  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');

  videoEl.classList.toggle('p2-mirror-palette', playerKey === 'p2' && isMirrorMatch);

  const isLoopingState = ['idle.mp4', 'mid-air.mp4', 'faint.mp4'].includes(fileName);
  videoEl.loop = isLoopingState;

  const riderId = player.id || 'ichigo';
  const rawUrl = `assets/videos/${riderId}/${fileName}`;
  const videoUrl = (window.gameState.videoCache && window.gameState.videoCache[rawUrl]) || rawUrl;

  if (videoEl.dataset.currentFile !== videoUrl) {
    videoEl.dataset.currentFile = videoUrl;
    videoEl.src = videoUrl;
    videoEl.load();
    const playPromise = videoEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  } else if (videoEl.paused && isLoopingState && !videoEl.ended) {
    videoEl.play().catch(() => {});
  }

  if (spriteEl) spriteEl.hidden = true;
  videoEl.hidden = false;
}

window.unlockMobileVideos = unlockMobileVideos;
window.getTransformFlip = getTransformFlip;
window.preloadRiderVideos = preloadRiderVideos;
window.playCenterVideo = playCenterVideo;
window.hideCenterScreen = hideCenterScreen;
window.updateCharacterMedia = updateCharacterMedia;
