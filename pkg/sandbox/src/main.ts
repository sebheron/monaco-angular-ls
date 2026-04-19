import { createEditors } from "./app";
import LZString from "lz-string";

const htmlElement = document.getElementById('html-editor') as HTMLElement;
const tsElement = document.getElementById('ts-editor') as HTMLElement;

if (!htmlElement || !tsElement) {
    throw new Error('Missing elements');
}

const {tsEditor, htmlEditor} = createEditors(htmlElement, tsElement);

async function store() {
    const ts = tsEditor.getValue();
    const html = htmlEditor.getValue();
    const data = JSON.stringify({ts, html});
    const compressed = LZString.compressToEncodedURIComponent(data);
    if (compressed.length < 2000) {
        window.location.hash = compressed;
    }
    else {
        console.warn('Data is too large to store in URL');
        window.location.hash = '';
    }
}

tsEditor.onDidChangeModelContent(store);
htmlEditor.onDidChangeModelContent(store);

try {
    const compressed = window.location.hash.substring(1);
    const data = LZString.decompressFromEncodedURIComponent(compressed);
    if (!data) throw new Error('No data');
    const {ts, html} = JSON.parse(data);
    tsEditor.setValue(ts);
    htmlEditor.setValue(html);
}
catch (e) {
tsEditor.setValue(
`import { Component } from '@angular/core';

@Component({
    selector: 'app-hello',
    templateUrl: './app.html',
})
export class HelloComponent {
    title = 'Hello Angular';
}`);

htmlEditor.setValue(
`<div>
    <h1>{{ title }}</h1>
    <h2>{{ subtitle }}</h2>
</div>`);
}