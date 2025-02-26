# webcomic-scraper
Userscript that flips through pages of a webcomic and zips them up into a .cbz file. Can embed titles and alt text.

## Installation

Add the [Tampermonkey extension](https://www.tampermonkey.net/) to your browser following the directions on their site. It's recommended to use Firefox because Chrome and Edge put a hard limit on web storage, which the script uses to store images between pages until it's ready to zip them up. Firefox lets you configure this limit manually. More detail on this can be found in the script itself.

In the Tampermonkey dashboard, go to the Utilities page and copy the link the main script (https://raw.githubusercontent.com/gatebuildr/webcomic-scraper/refs/heads/main/comic-scraper.js) where it says "Import from URL".

On the "Installed Userscripts" page, open the Webcomic Archiver script, for every new comic add a @match header for the site URL and new config object in the comicConfigs list customized for that comic. Several examples have been provided.

## Usage

When running on a webcomic site, a yellow box with a number input and "Save Pages" button will appear in the upper-right corner of the page. Enter a number of pages, click the button, and wait for the script to cache each page and navigate to the next one until it hits the page count or runs out of new pages. A cbz file will then be downloaded through the browser. The script cache is located in session storage, so it will be wiped when you close the tab. The script itself also resets the cache when it completes the process, so if you're downloading in batches you can just click to the next page and do it again for the next batch.

## Other Notes

The initial framework of this script was AI-generated and has been heavily modified and cleaned up. If you notice anything weird or unnecessary, let me know or submit a pull request. I don't want to clutter the main script with lots of configurations for specific comics, but if you want to share them maybe I'll just add a folder with a bunch of configs that people can copy into their script.
