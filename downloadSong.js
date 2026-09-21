// NAME: Song Downloader
// AUTHOR: Omar-mk06
// VERSION: 4.0
// DESCRIPTION: Download any Spotify song as an MP3 file. Uses spotdl (if installed) or web services.

/// <reference path="../globals.d.ts" />

(function SongDownloader() {
	const { CosmosAsync, Player, ContextMenu, URI } = Spicetify;

	if (!(CosmosAsync && URI && ContextMenu)) {
		setTimeout(SongDownloader, 300);
		return;
	}

	// ─── Styles ───────────────────────────────────────────────────────────────
	const style = document.createElement("style");
	style.textContent = `
		#sd-player-dl-btn {
			background: none;
			border: none;
			cursor: pointer;
			color: var(--spice-subtext, #aaa);
			padding: 8px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 50%;
			transition: color 0.15s, transform 0.1s;
		}
		#sd-player-dl-btn:hover {
			color: var(--spice-button, #1db954);
			transform: scale(1.08);
		}
		#sd-player-dl-btn:active { transform: scale(0.95); }
		#sd-player-dl-btn.sd-busy {
			animation: sd-spin 1s linear infinite;
			pointer-events: none;
		}
		@keyframes sd-spin {
			from { transform: rotate(0deg); }
			to   { transform: rotate(360deg); }
		}
	`;
	document.head.appendChild(style);

	// ─── Helpers ──────────────────────────────────────────────────────────────
	function notify(msg, isError = false) {
		if (Spicetify.showNotification) Spicetify.showNotification(msg, isError);
	}

	function safeFilename(str) {
		return str.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim().slice(0, 180);
	}

	// ─── Track info ───────────────────────────────────────────────────────────
	async function getTrackInfo(uri) {
		const id = uri.split(":")[2];
		try {
			const item = Player.data?.item;
			if (item?.uri === uri) {
				return {
					id,
					name:   item.name ?? "",
					artist: item.artists?.map((a) => a.name).join(", ")
					        ?? item.metadata?.artist_name ?? "",
				};
			}
			const res = await CosmosAsync.get(`https://api.spotify.com/v1/tracks/${id}`);
			return { id, name: res.name, artist: res.artists.map((a) => a.name).join(", ") };
		} catch (_) {
			return { id, name: id, artist: "" };
		}
	}

	// ─── Method 1: local spotdl server (http://localhost:7879) ───────────────
	// Run "Start Downloader.bat" once to start the server.
	// fetch to localhost bypasses CORS; server runs spotdl and saves to Music\Spotify Downloads.
	const SERVER = "http://localhost:7879";

	// Call /setup once on extension load so the library folder is registered immediately.
	(async () => {
		try {
			await fetch(`${SERVER}/setup`, { signal: AbortSignal.timeout(2000) });
			console.log("[SD] Library folder registered in Spotify Local Files.");
		} catch (_) {
			console.log("[SD] Server not running yet — start 'Start Downloader.bat' when ready.");
		}
	})();

	async function serverAvailable() {
		try {
			const res = await fetch(`${SERVER}/ping`, { signal: AbortSignal.timeout(1000) });
			return res.ok;
		} catch (_) { return false; }
	}

	async function downloadViaServer(spotifyUrl) {
		try {
			const res  = await fetch(
				`${SERVER}/download?url=${encodeURIComponent(spotifyUrl)}`,
				{ signal: AbortSignal.timeout(300000) }
			);
			const data = await res.json();
			if (data.status === "done") return "ok";
			console.warn("[SD] server error:", data.error);
			return "error";
		} catch (e) {
			console.warn("[SD] server request failed:", e?.message ?? e);
			return "error";
		}
	}

	// Ask Spotify to refresh its local files index so the new song appears immediately.
	async function refreshLocalFiles() {
		try {
			// Try Platform API first
			const lf = Spicetify.Platform?.LocalFilesAPI;
			if (lf?.getTracks)  await lf.getTracks();
			if (lf?.getStatus)  await lf.getStatus();
		} catch (_) {}
		try {
			// Try cosmos refresh
			await CosmosAsync.post("sp://local-files/v1/refresh", {});
		} catch (_) {}
	}

	// ─── Method 2: web API fallback ───────────────────────────────────────────
	async function fetchViaWebApi(trackId) {
		const apiUrl = `https://api.spotifydown.com/download/${trackId}`;
		const attempts = [
			// CosmosAsync (native Spotify HTTP — may bypass CSP)
			async () => {
				const d = await CosmosAsync.get(apiUrl);
				if (d?.success && d?.link) return d.link;
				console.warn("[SD] CosmosAsync spotifydown:", d?.message ?? d);
				return null;
			},
			// CORS proxy
			async () => {
				const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
				const res   = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
				const outer = await res.json();
				const d     = JSON.parse(outer.contents);
				if (d?.success && d?.link) return d.link;
				console.warn("[SD] proxy spotifydown:", d?.message ?? d);
				return null;
			},
		];
		for (let i = 0; i < attempts.length; i++) {
			try {
				const link = await attempts[i]();
				if (link) return link;
			} catch (e) { console.warn(`[SD] web attempt ${i + 1}:`, e?.message ?? e); }
		}
		return null;
	}

	async function saveCdnFile(cdnUrl, filename) {
		try {
			const res    = await fetch(cdnUrl);
			if (!res.ok) throw new Error(res.status);
			const blob   = await res.blob();
			const objUrl = URL.createObjectURL(blob);
			const a      = document.createElement("a");
			a.href = objUrl; a.download = `${filename}.mp3`;
			document.body.appendChild(a); a.click();
			setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(objUrl); }, 3000);
			return true;
		} catch (_) {}
		try {
			const a = document.createElement("a");
			a.href = cdnUrl; a.download = `${filename}.mp3`; a.target = "_blank";
			document.body.appendChild(a); a.click();
			setTimeout(() => document.body.removeChild(a), 1000);
			return true;
		} catch (_) {}
		return false;
	}

	// ─── Main download entry point ────────────────────────────────────────────
	let _busy = false;
	async function downloadTrack(uri) {
		if (_busy) { notify("Already downloading, please wait…"); return; }
		if (!URI.isTrack(uri)) return;
		_busy = true; setBusy(true);

		try {
			notify("Getting track info…");
			const info       = await getTrackInfo(uri);
			const spotifyUrl = `https://open.spotify.com/track/${info.id}`;
			const filename   = safeFilename(info.artist ? `${info.artist} - ${info.name}` : info.name);

			// ── Method 1: local spotdl server ────────────────────────────────
			notify("Connecting to downloader…");
			const hasServer = await serverAvailable();
			if (hasServer) {
				notify(`Downloading "${info.name}"… (this takes ~30 sec)`);
				const result = await downloadViaServer(spotifyUrl);
				if (result === "ok") {
					await refreshLocalFiles();
					notify(`✓ "${info.name}" added to Local Files in Spotify!`);
					return;
				}
				notify("spotdl error — trying web fallback…");
			} else {
				console.log("[SD] local server not running, trying web API");
			}

			// ── Method 2: web API fallback ────────────────────────────────────
			notify(`Searching online for "${info.name}"…`);
			const cdnUrl = await fetchViaWebApi(info.id);
			if (cdnUrl) {
				notify(`Saving "${info.name}"…`);
				const ok = await saveCdnFile(cdnUrl, filename);
				if (ok) { notify(`✓ "${info.name}" saved to Downloads folder!`); return; }
			}

			// ── Nothing worked ────────────────────────────────────────────────
			notify(
				hasServer
					? "Download failed. Check console for details."
					: '⚠ Run "Start Downloader.bat" in the spicetify folder, then try again.',
				true
			);
		} finally {
			_busy = false; setBusy(false);
		}
	}

	// ─── Context Menu ─────────────────────────────────────────────────────────
	new ContextMenu.Item(
		"Download Song",
		([uri]) => downloadTrack(uri),
		([uri]) => URI.isTrack(uri),
		"download"
	).register();

	// ─── Player bar button ────────────────────────────────────────────────────
	const ICON_DL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
		<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
	</svg>`;
	const ICON_SPIN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
		<path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/>
	</svg>`;

	function setBusy(on) {
		const btn = document.getElementById("sd-player-dl-btn");
		if (!btn) return;
		btn.classList.toggle("sd-busy", on);
		btn.innerHTML = on ? ICON_SPIN : ICON_DL;
		btn.title = on ? "Downloading…" : "Download song as MP3";
	}

	function addPlayerButton() {
		if (document.getElementById("sd-player-dl-btn")) return;

		const controls =
			document.querySelector(".main-nowPlayingBar-right") ??
			document.querySelector("[data-testid='now-playing-bar'] [class*='extraControls']") ??
			document.querySelector(".player-controls__right");

		if (!controls) { setTimeout(addPlayerButton, 1500); return; }

		const btn = document.createElement("button");
		btn.id = "sd-player-dl-btn";
		btn.innerHTML = ICON_DL;
		btn.title = "Download song as MP3";
		btn.onclick = () => {
			const uri = Player.data?.item?.uri;
			if (!uri) { notify("No song is currently playing", true); return; }
			downloadTrack(uri);
		};
		controls.prepend(btn);
	}

	addPlayerButton();

	const obs = new MutationObserver(() => {
		if (!document.getElementById("sd-player-dl-btn")) addPlayerButton();
	});
	obs.observe(document.body, { childList: true, subtree: false });

})();
