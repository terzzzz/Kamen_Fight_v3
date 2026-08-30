/**
 * Media, Video & Animation Controller
 * Path: js/media.js
 */

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

// Side Character Video Updater (Idle, Mid-Air, Faint, Victory, KO)
function updateCharacterMedia(playerKey, stateType = 'IDLE') {
  const videoEl = document.getElementById(`${playerKey}-video`);
  const spriteEl = document.getElementById(`${playerKey}-sprite`);
  if (!videoEl) return;

  const player = window.gameState ? window.gameState[playerKey] : null;
  const riderId = (player && player.id) ? player.id : (playerKey === 'p1' ? 'ichigo' : 'nigo');

  let fileName = stateType;
  if (stateType === 'IDLE') {
    if (player && player.isFainted) {
      fileName = 'faint.mp4';
    } else if (player && player.airborneTicks > 0) {
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

  const videoUrl = `assets/videos/${riderId}/${fileName}`;

  videoEl.style.transform = getTransformFlip(player, playerKey);
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');

  const isLoopingState = ['idle.mp4', 'mid-air.mp4', 'faint.mp4'].includes(fileName);
  videoEl.loop = isLoopingState;

  if (videoEl.getAttribute('src') !== videoUrl) {
    videoEl.src = videoUrl;
    videoEl.load();
    const playPromise = videoEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  } else if (videoEl.paused && isLoopingState) {
    videoEl.play().catch(() => {});
  }

  if (spriteEl) spriteEl.hidden = true;
  videoEl.hidden = false;
  videoEl.style.display = 'block';
}

// Action Cutscene Video Player (Center Box)
function playCenterVideo(playerKey, videoFile, actionName = '', maxDurationMs = null, moveObj = null) {
  return new Promise((resolve) => {
    const centerBox = document.getElementById('center-box');
    const centerVid = document.getElementById('center-video');
    const actionLabel = document.getElementById('center-action-label');
    
    if (!centerBox || !centerVid) {
      resolve();
      return;
    }

    const player = window.gameState ? window.gameState[playerKey] : null;
    const riderId = (player && player.id) ? player.id : (playerKey === 'p1' ? 'ichigo' : 'nigo');

    if (actionLabel) {
      const name = player ? player.name : playerKey.toUpperCase();
      actionLabel.textContent = actionName ? `[${playerKey.toUpperCase()}] ${name} : ${actionName}!` : '';
      actionLabel.hidden = !actionName;
    }

    centerBox.hidden = false;
    centerBox.style.display = 'flex';

    centerVid.muted = true;
    centerVid.playsInline = true;
    centerVid.setAttribute('playsinline', '');
    centerVid.setAttribute('webkit-playsinline', '');
    centerVid.style.transform = getTransformFlip(player, playerKey, moveObj);

    let resolved = false;
    let fallbackTimer = null;

    const cleanUpAndResolve = () => {
      if (resolved) return;
      resolved = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);

      centerVid.removeEventListener('ended', cleanUpAndResolve);
      centerVid.removeEventListener('error', cleanUpAndResolve);
      centerVid.removeEventListener('loadedmetadata', setupDynamicTimeout);

      centerVid.pause();
      centerBox.hidden = true;
      centerBox.style.display = 'none';
      if (actionLabel) actionLabel.hidden = true;
      resolve();
    };

    const setupDynamicTimeout = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (maxDurationMs) {
        fallbackTimer = setTimeout(cleanUpAndResolve, maxDurationMs);
      } else if (centerVid.duration && !isNaN(centerVid.duration) && centerVid.duration > 0) {
        // Allow full video playback + 1000ms safety buffer before forcing cleanup
        fallbackTimer = setTimeout(cleanUpAndResolve, Math.ceil(centerVid.duration * 1000) + 1000);
      } else {
        fallbackTimer = setTimeout(cleanUpAndResolve, 8000);
      }
    };

    centerVid.addEventListener('ended', cleanUpAndResolve);
    centerVid.addEventListener('error', cleanUpAndResolve);
    centerVid.addEventListener('loadedmetadata', setupDynamicTimeout);

    const videoUrl = `assets/videos/${riderId}/${videoFile}`;
    centerVid.src = videoUrl;
    centerVid.load();

    const playPromise = centerVid.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        setTimeout(cleanUpAndResolve, 1200);
      });
    }

    // Default safety timer before metadata loads (8s generously accommodates long special attacks)
    fallbackTimer = setTimeout(cleanUpAndResolve, maxDurationMs || 8000);
  });
}

function hideCenterScreen() {
  const centerBox = document.getElementById('center-box');
  const centerVid = document.getElementById('center-video');
  if (centerVid) {
    centerVid.pause();
    centerVid.removeAttribute('src');
  }
  if (centerBox) {
    centerBox.hidden = true;
    centerBox.style.display = 'none';
  }
}

function unlockMobileVideos() {
  const vids = document.querySelectorAll('video');
  vids.forEach(v => {
    v.muted = true;
    v.playsInline = true;
    const p = v.play();
    if (p !== undefined) {
      p.then(() => v.pause()).catch(() => {});
    }
  });
}

window.getTransformFlip = getTransformFlip;
window.updateCharacterMedia = updateCharacterMedia;
window.playCenterVideo = playCenterVideo;
window.hideCenterScreen = hideCenterScreen;
window.unlockMobileVideos = unlockMobileVideos;
