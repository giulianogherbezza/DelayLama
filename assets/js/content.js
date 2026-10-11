/*
	Delay Lama – Inhalte aus content/*.json laden und in die Seiten einsetzen.
	Die JSON-Dateien werden über das CMS unter /admin bearbeitet.

	Platzhalter im HTML: <... data-cms="name"></...>
	Jede Seite enthält nur die Platzhalter, die sie braucht.
*/

(function() {

	// Hilfsfunktionen.

		function load(name) {
			// no-cache: Browser fragt nach, ob es eine neue Version gibt,
			// damit Änderungen aus dem CMS sofort sichtbar sind.
			return fetch('content/' + name + '.json', { cache: 'no-cache' })
				.then(function(response) {
					if (!response.ok)
						throw new Error(name + '.json: HTTP ' + response.status);
					return response.json();
				});
		}

		function escapeHtml(value) {
			return String(value == null ? '' : value)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}

		// Nur http(s)-, mailto- und relative Links zulassen.
		function safeUrl(url) {
			url = String(url || '').trim();
			if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(https?|mailto):/i.test(url))
				return '#';
			return escapeHtml(url);
		}

		// Kleiner Markdown-Renderer für Fliesstext:
		// Absätze, Zeilenumbrüche, Listen (- ), **fett**, *kursiv*, [Link](url).
		function markdown(text) {

			function inline(line) {
				return escapeHtml(line)
					.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
					.replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>')
					.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function(match, label, url) {
						return '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener">' + label + '</a>';
					})
					.replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1');
			}

			return String(text || '')
				.replace(/\r\n?/g, '\n')
				.split(/\n\s*\n/)
				.map(function(block) {
					var lines = block.split('\n').map(function(line) {
						// Harte Zeilenumbrüche aus dem Editor ("\" oder zwei Leerzeichen am Ende).
						return line.replace(/(\\| {2,})$/, '');
					});

					if (lines.every(function(line) { return /^\s*[-*] /.test(line); }))
						return '<ul>' + lines.map(function(line) {
							return '<li>' + inline(line.replace(/^\s*[-*] /, '')) + '</li>';
						}).join('') + '</ul>';

					return '<p>' + lines.map(inline).join('<br />') + '</p>';
				})
				.join('');
		}

		function parseDate(value) {
			var parts = String(value || '').split('T')[0].split('-');
			return new Date(+parts[0], +parts[1] - 1, +parts[2]);
		}

		function formatDate(date) {
			return date.toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' });
		}

		function youtubeId(url) {
			var match = String(url || '').match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/|live\/)([\w-]{11})/);
			return match ? match[1] : null;
		}

		// Rendert in alle Platzhalter mit data-cms="name" und gibt zurück, ob es welche gab.
		function render(name, html) {
			var targets = document.querySelectorAll('[data-cms="' + name + '"]');
			for (var i = 0; i < targets.length; i++)
				targets[i].innerHTML = html;
			return targets.length > 0;
		}

		function has(name) {
			return document.querySelector('[data-cms="' + name + '"]') !== null;
		}

		function fail(names, error) {
			console.error('Inhalte konnten nicht geladen werden:', error);
			names.forEach(function(name) {
				render(name, '<p><em>Inhalte konnten nicht geladen werden.</em></p>');
			});
		}

	// Konzerte.

		function eventItem(event) {
			var label = escapeHtml(event.place);
			if (event.venue)
				label += ' – ' + escapeHtml(event.venue);
			if (event.link)
				label = '<a href="' + safeUrl(event.link) + '" target="_blank" rel="noopener">' + label + '</a>';
			return '<li><strong>' + formatDate(event._date) + '</strong> ' + label + '</li>';
		}

		if (has('events-upcoming') || has('events-past'))
			load('events').then(function(data) {
				var today = new Date();
				today.setHours(0, 0, 0, 0);

				var events = (data.events || []).map(function(event) {
					event._date = parseDate(event.date);
					return event;
				});

				var upcoming = events
					.filter(function(event) { return event._date >= today; })
					.sort(function(a, b) { return a._date - b._date; });

				var past = events
					.filter(function(event) { return event._date < today; })
					.sort(function(a, b) { return b._date - a._date; });

				render('events-upcoming', upcoming.length
					? '<ul class="alt">' + upcoming.map(eventItem).join('') + '</ul>'
					: '<p>Aktuell sind keine Konzerte geplant. Folge uns auf Instagram, um nichts zu verpassen!</p>');

				// Vergangene Konzerte nach Jahr gruppieren.
				var html = '', year = null;
				past.forEach(function(event) {
					var y = event._date.getFullYear();
					if (y !== year) {
						if (year !== null) html += '</ul>';
						html += '<h4>' + y + '</h4><ul class="alt">';
						year = y;
					}
					html += eventItem(event);
				});
				if (year !== null) html += '</ul>';
				render('events-past', html);
			}).catch(fail.bind(null, ['events-upcoming', 'events-past']));

	// Bandmitglieder (Startseite).

		if (has('members'))
			load('members').then(function(data) {
				render('members', (data.members || []).map(function(member) {
					return '<section class="spotlight">'
						+ '<div class="image"><img src="' + safeUrl(member.image) + '" alt="' + escapeHtml(member.name) + '" /></div>'
						+ '<div class="content">'
						+ '<h2>' + escapeHtml(member.name) + '<br />' + escapeHtml(member.role) + '</h2>'
						+ '<p>' + escapeHtml(member.text) + '</p>'
						+ '</div>'
						+ '</section>';
				}).join(''));
			}).catch(fail.bind(null, ['members']));

	// About us.

		if (has('about'))
			load('about').then(function(data) {
				var links = '';
				if (data.spotify)
					links += '<li><a href="' + safeUrl(data.spotify) + '" target="_blank" rel="noopener" class="icon brands fa-spotify"><span class="label">Spotify</span></a><p>Spotify</p></li>';
				if (data.apple_music)
					links += '<li><a href="' + safeUrl(data.apple_music) + '" target="_blank" rel="noopener" class="icon brands fa-apple"><span class="label">Apple Music</span></a><p>Apple Music</p></li>';

				render('about', '<h3>' + escapeHtml(data.title) + '</h3>'
					+ markdown(data.body)
					+ (links
						? '<div class="listen-on"><p><strong>Höre uns jetzt auf:</strong></p><ul class="icons">' + links + '</ul></div>'
						: ''));
			}).catch(fail.bind(null, ['about']));

	// Bildergalerie.

		if (has('gallery'))
			load('gallery').then(function(data) {
				render('gallery', (data.images || []).map(function(item) {
					return '<div class="col-4 col-6-small col-12-xsmall"><span class="image fit"><img src="' + safeUrl(item.image) + '" alt="' + escapeHtml(item.alt) + '" loading="lazy" /></span></div>';
				}).join(''));
			}).catch(fail.bind(null, ['gallery']));

	// Downloads.

		if (has('downloads'))
			load('downloads').then(function(data) {
				render('downloads', (data.intro ? '<p>' + escapeHtml(data.intro) + '</p>' : '')
					+ '<ul class="actions">' + (data.files || []).map(function(item) {
						return '<li><a href="' + safeUrl(item.file) + '" class="button primary" download>' + escapeHtml(item.label) + '</a></li>';
					}).join('') + '</ul>');
			}).catch(fail.bind(null, ['downloads']));

	// Einstellungen: Video (Startseite) und Social-Media-Links (Footer, alle Seiten).

		load('settings').then(function(data) {
			var socials = [
				[data.facebook, 'brands fa-facebook-f', 'Facebook'],
				[data.instagram, 'brands fa-instagram', 'Instagram'],
				[data.youtube, 'brands fa-youtube', 'YouTube']
			].filter(function(item) { return item[0]; }).map(function(item) {
				return '<li><a href="' + safeUrl(item[0]) + '" target="_blank" rel="noopener" class="icon ' + item[1] + '"><span class="label">' + item[2] + '</span></a></li>';
			});

			if (data.email)
				socials.push('<li><a href="mailto:' + escapeHtml(data.email) + '" class="icon solid fa-envelope"><span class="label">E-Mail</span></a></li>');

			render('socials', socials.join(''));

			var video = data.video || {}, id = youtubeId(video.url);
			render('video', id
				? '<header class="major"><h2>' + escapeHtml(video.title) + '</h2>'
					+ (video.subtitle ? '<p>' + escapeHtml(video.subtitle) + '</p>' : '')
					+ '</header><div class="video-container"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '" title="' + escapeHtml(video.title) + '" frameborder="0" allowfullscreen></iframe></div>'
				: '');
		}).catch(function(error) {
			console.error('Einstellungen konnten nicht geladen werden:', error);
		});

	// Jahr im Copyright.

		render('year', String(new Date().getFullYear()));

})();
