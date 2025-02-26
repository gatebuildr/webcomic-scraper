// ==UserScript==
// @name         Webcomic Archiver
// @author       Matt Spain
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Zips through webcomic pages and saves them as a .cbz archive
// @match        https://www.nedroid.com/*
// @match        https://nedroid.com/*
// @match        https://www.buttersafe.com/**
// @match        https://www.paranatural.net/comic/**
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js
// @require      https://gist.githubusercontent.com/gatebuildr/c5da97db589cfb983b2cbf9a1a602ff9/raw/dc4d2c1b2d16616ea4294fbfa4ec551c64eaa571/waitForIt.js
// ==/UserScript==

(function() {
    'use strict';

    /*
    Note: this script relies on session storage to keep all the comic pages in memory until they're ready to be zipped up.
    In order to keep more than a few pages at a time, you'll need to increase your browser's maximum storage quota, which usually defaults to around 5MB.
    This doesn't appear to be possible in Chrome or Edge, so it's recommended you use Firefox for this script.
    To increase your quota in Firefox, navigate to about:config and change BOTH the "dom.storage.default_quota" and "dom.storage.default_site_quota" parameters.
    It's probably best to keep this as conservative as possible (so other sites can't abuse it accidentally), so use the following guidelines:
    - In Firefox, the quota is written in KB, so the default 5120 means 5MB
    - Normal comic book cbz files max out at around 4MB / page, but that's for full-color, full-size pages with lots of gradient shading and not much compression. Most webcomics are going to be way less detailed than that.
    - Nedroid maxed around 835 KB/page
    - Buttersafe maxed around 425 KB/page
    - Paranatural maxed around 885 KB/page
    - Seems like 1 MB / expected page is reasonable
    */

    const defaultTextParams = {
        // These will be used as fallback values for the topText and bottomText entries in a comic configuration.
        'text': '', // If the text is an empty string (not every page has alt text for example), the whole thing will be ignored and no extra padding added
        'paddingTop': 5,
        'paddingBottom': 5,
        'paddingLeft': 5,
        'paddingRight': 5,
        'textAlign': 'center', // left, center

        // These font styles can be used as in CSS https://developer.mozilla.org/en-US/docs/Web/CSS/font
        'fontStyle': '', // italic, oblique, oblique 10deg
        'fontVariant': '',
        'fontWeight': '', // bold, lighter, bolder, 100, 900
        'fontStretch': '', // condensed, expanded, ultra-expanded, 50%, 150%

        // Unlike CSS, font-size and line-height must be an integer number of total pixels.
        // Make sure to include both fontSize and lineHeight, so that they make sense together.
        'fontSize': 18,
        'lineHeight': 20,

        'fontFamily': 'Arial', // https://developer.mozilla.org/en-US/docs/Web/CSS/font-family

        // Text is added to the page using a canvas, so you can use a different color or gradient if you want. Don't know if patterns work for text.
        // https://www.w3schools.com/jsref/canvas_fillstyle.asp
        'fillStyle': '#000000'
    }
    const defaultConfig = {
        'pageLoaded': () => true,
        'topText': () => [],
        'bottomText': () => []
    }

    const comicConfigs = [
        {
            'name': 'Nedroid Picture Diary', // just used for debugging
            'url': /nedroid.com/, // Regex to match the URL of the page you're on. The first match decides which config to use.

            // Note that all the below properties are functions and will only be called if we match on this config
            'bookName': ({firstPage, lastPage}) => `Nedroid Picture Diary #${firstPage}-${lastPage}`, // What you want the book to be named when downloading
            'pageNumber': () => window.location.href.match(/nedroid.com\/\?(\d+)$/)[1], // extract the enumerator to use for the pages. Doesn't matter what it is as long as it sorts numerically or alphabetically (e.g. ISO 8601)
            'nextPageURL': () => Array.from(document.querySelectorAll('a')).filter(it => it.innerText.includes('NEXT'))[0].href, // URL for the next page. If this is the same as the current URL or is falsy, we're already on the latest page
            'imageURL': () => document.querySelector('img.comic').src, // URL for the image on the current page
            'pageLoaded': () => true, // Script will wait until this becomes true before scraping the page. Useful if some stuff is fetched after page load. If omitted, scrape will begin immediately.

            'fillStyle': 'rgb(51, 81, 119)', // Background color of the page behind the comic and text. Defaults to white if unspecified.

            // Text blocks that should appear above or below the comic. Use the text params above as guidelines. If any of the texts are falsy, they're skipped over and we don't add their padding to the page.
            'topText': () => [{
                'text': document.querySelector('.comic_title h1').innerText,
                'paddingTop': 5,
                'paddingBottom': 5,
                'fontStyle': 'italic',
                'fontFamily': 'Roboto',
                'fontWeight': 700,
                'fontSize': 32,
                'lineHeight': 38,
                'fillStyle': 'rgb(255, 248, 224)'
            }],
            'bottomText': () => [{
                'text': document.querySelector('img.comic').getAttribute('title'),
                'fontFamily': 'Roboto',
                'fillStyle': 'rgb(120, 157, 202)'
            }]
        },
        {
            'name': 'Buttersafe',
            'url': /buttersafe.com\/(\d{4})\/(\d{2})\/(\d{2})/,
            'bookName': ({firstPage, lastPage}) => `Buttersafe ${firstPage} to ${lastPage}`,
            'pageNumber': () => {
                const [,year,month,day] = /buttersafe.com\/(\d{4})\/(\d{2})\/(\d{2})/.exec(window.location.href);
                return `${year}-${month}-${day}`
            },
            'nextPageURL': () => Array.from(document.querySelectorAll('a[rel="next"]')).map(it=>it.href)[0],
            'imageURL': () => document.querySelector('#comic>img').src,
            'topText': () => [{
                text: document.querySelector('div.post-comic>h2').innerText,
                'fontFamily': 'Trebuchet MS',
                'fontSize': 24,
                'lineHeight': 26,
                'fontWeight': 'bold',
                'fillStyle': '#333333'
            }],
            'bottomText': () => [{
                'text': document.querySelector('div.entry').innerText,
                'paddingTop': 20,
                'textAlign': 'left',
                'paddingLeft': 25,
                'paddingRight': 25,
                'fillStyle': '#333333',
                'fontSize': 11,
                'lineHeight': 13,
            }]
        },
        {
            'name': 'Paranatural',
            'url': /paranatural.net\/comic/,
            'bookName': ({firstPage, lastPage}) => `Paranatural ${firstPage} to ${lastPage}`,
            'pageNumber': () => (new Date(Date.parse(document.querySelector('div.cc-publishtime').innerText.match(/Posted (.+) at/)[1]))).toISOString().slice(0,10),
            'nextPageURL': () => Array.from(document.querySelectorAll('a.cc-next')).map(it=>it.href)[0],
            'imageURL': () => document.querySelector('#cc-comic').src,
            'bottomText': () => [{
                'text': document.querySelector('#cc-comic').title,
                'fontFamily': 'Verdana',
                'fontSize': 12,
                'lineHeight': 13,
                'fontStyle': 'italic',
                'fillStyle': '#824f6c'
            }]
        }
    ]

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function base64ToBlob(base64, type = 'image/jpeg') {
        const byteCharacters = atob(base64);
        const byteArrays = [];
        for (let i = 0; i < byteCharacters.length; i += 512) {
            const slice = byteCharacters.slice(i, i + 512);
            const byteNumbers = new Array(slice.length);
            for (let j = 0; j < slice.length; j++) {
                byteNumbers[j] = slice.charCodeAt(j);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
        }
        return new Blob(byteArrays, { type });
    }

    function createWrappedTextCanvas(maxWidth, {text, paddingTop, paddingBottom, paddingLeft, paddingRight, textAlign, fontStyle, fontVariant, fontWeight, fontStretch, fontSize, lineHeight, fontFamily, fillStyle}) {
        // Create a temporary canvas
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        const fullFont = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}px ${fontVariant} ${fontStretch} ${fontFamily}`
        ctx.font = fullFont
        const usableWidth = maxWidth - paddingLeft - paddingRight

        const lines = text.split('\n'); // Split on existing newlines
        let wrappedLines = [];

        for (let i = 0; i < lines.length; i++) {
            let words = lines[i].split(' ');
            let line = '';

            for (let j = 0; j < words.length; j++) {
                let testLine = line + (line ? ' ' : '') + words[j];
                let metrics = ctx.measureText(testLine);
                if (metrics.width > usableWidth && line !== '') {
                    wrappedLines.push(line);
                    line = words[j];
                } else {
                    line = testLine;
                }
            }
            wrappedLines.push(line); // Push last line of the paragraph
        }

        // Calculate the final height needed
        let totalHeight = wrappedLines.length * lineHeight + lineHeight-fontSize + paddingTop + paddingBottom;

        // Resize canvas to fit the text
        tempCanvas.width = maxWidth;
        tempCanvas.height = totalHeight;

        // Redraw text onto the resized canvas
        ctx.font = fullFont // not sure why this gets reset after the canvas resize, but it does
        ctx.fillStyle = fillStyle;
        ctx.textAlign = textAlign;

        let currentY = paddingTop + lineHeight; // Start drawing with an offset
        for (let i = 0; i < wrappedLines.length; i++) {
            ctx.fillText(wrappedLines[i], (textAlign==='center' ? usableWidth/2 : 0) + paddingLeft, currentY);
            currentY += lineHeight;
        }
        return { canvas: tempCanvas, totalHeight };
    }

    async function generateImage({imageURL, fillStyle, topText, bottomText, pageNumber}) {

        console.log('Generating image...');
        const filename = pageNumber();

        console.log(`Processing page: ${filename}`);

        const image = new Image();
        image.src = imageURL();

        return new Promise(resolve => {
            image.onload = async function() {
                console.log('Image loaded, drawing to canvas...');
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                let totalHeight = image.height
                const tops = []
                const bottoms = []
                for(const top of topText().map(it=>_.defaults(it, defaultTextParams))) {
                    if(top.text) {
                        const {canvas} = createWrappedTextCanvas(image.width, top);
                        totalHeight+=canvas.height;
                        tops.push(canvas);
                    }
                }
                for(const bottom of bottomText().map(it=>_.defaults(it, defaultTextParams))) {
                    if(bottom.text) {
                        const {canvas} = createWrappedTextCanvas(image.width, bottom);
                        totalHeight+=canvas.height;
                        bottoms.push(canvas);
                    }
                }

                canvas.width = image.width;
                canvas.height = totalHeight;
                ctx.fillStyle = fillStyle || '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                let currentYPos = 0;
                for(const canvas of tops) {
                    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, currentYPos, canvas.width, canvas.height);
                    currentYPos += canvas.height;
                }

                ctx.drawImage(image, 0, currentYPos);
                currentYPos += image.height;

                for(const canvas of bottoms) {
                    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, currentYPos, canvas.width, canvas.height);
                    currentYPos += canvas.height;
                }

                canvas.toBlob(async blob => {
                    console.log({w:canvas.width,h: canvas.height, blob})
                    const base64 = await blobToBase64(blob);
                    sessionStorage.setItem(filename, base64);
                    resolve(filename);
                }, 'image/jpeg', 1.0);
            };
        });
    }

    async function processPage() {
        console.log('Processing page...');
        const state = JSON.parse(sessionStorage.getItem('archivalState')) || {};
        const { pageCount, images = [] } = state;

        const url = window.location.href
        let config = comicConfigs.find(it=>it.url.exec(url))
        if(!config) {
            console.log("Couldn't find a matching configuration for this page. Make sure the url regex is right.")
            return
        }
        config = _.defaults(config, defaultConfig);
        console.log(`Matched config for ${config.name}!`);

        if(config.pageLoaded) {
            await waitForIt(config.pageLoaded);
        }
        console.log('Page is loaded.');


        const filename = await generateImage(config);
        images.push(filename);
        console.log(`Saved page ${url} as ${filename}`);

        const nextLink = config.nextPageURL();
        let done = false;
        if (!nextLink || nextLink === window.location.href) {
            console.log("We've reached the last page. Zipping up now.");
            done=true;
        }
        else if (pageCount <= 1) {
            console.log('Page count reached. Zipping up now.');
            done=true;
        }
        if(done) {
            generateCBZ(images, config);
            return;
        }

        console.log(`Navigating to next page: ${nextLink}`);
        sessionStorage.setItem('archivalState', JSON.stringify({ pageCount: pageCount - 1, images }));
        window.location.href = nextLink;
    }

    function generateCBZ(images, {bookName}) {
        console.log('Generating .cbz file...');
        const zip = new JSZip();

        let firstPage, lastPage;
        images.forEach(filename => {
            const base64 = sessionStorage.getItem(filename);
            if (base64) {
                firstPage = firstPage || filename
                lastPage = filename;
                zip.file(filename+'.jpg', base64ToBlob(base64));
                sessionStorage.removeItem(filename);
            }
        });
        zip.generateAsync({ type: 'blob' }).then(blob => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = bookName({firstPage, lastPage}) + '.cbz';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            sessionStorage.removeItem('archivalState');
            console.log(`Download complete: ${link.download}`);
        });
    }

    function startArchival(pageCount) {
        console.log(`Starting archival for ${pageCount} pages...`);
        const currentPage = window.location.search.match(/\?(\d+)/)?.[1];
        sessionStorage.clear();
        sessionStorage.setItem('archivalState', JSON.stringify({ pageCount, startPage: currentPage, images: [] }));
        processPage();
    }

    function addControls() {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '10px';
        container.style.right = '10px';
        container.style.zIndex = '1000';
        container.style.padding = '10px';
        container.style.background = '#ffcc00';

        const input = document.createElement('input');
        input.type = 'number';
        input.value = '1';
        input.min = '1';
        input.style.width = '50px';
        container.appendChild(input);

        const button = document.createElement('button');
        button.innerText = 'Save Pages';
        button.style.marginLeft = '10px';
        button.addEventListener('click', () => startArchival(parseInt(input.value, 10)));
        container.appendChild(button);

        document.body.appendChild(container);
    }

    addControls();
    if (sessionStorage.getItem('archivalState')) {
        processPage();
    }
})();
