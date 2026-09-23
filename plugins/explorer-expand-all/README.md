# explorer-expand-all

Adds an expand-all / collapse-all toggle to the left explorer tree.

## What it does

One button sits at the right edge of the explorer's title row. Clicking it
either opens every folder, or closes every folder **except** the path leading to
the page currently being read, so the current location never disappears from the
tree. The icon (chevrons opening apart / closing together) and the accessible
label (`全部展开` / `全部收缩`) describe the action the next click will take.

## How it works

Quartz builds the tree client-side, so the control cannot be rendered by the
server. A `transformer` plugin contributes CSS and JS: `client.js` runs
`afterDOMReady`, appends the button to each `div.explorer`, and on click walks
the rendered `.folder-outer` elements, toggling `.open` and writing each
folder's `{ path, collapsed }` back into the same `fileTree` localStorage key
the stock explorer uses. The current page's slug (from `location.pathname`,
normalised to drop the trailing `index`) is compared against each folder's
`data-folderpath`, and matching ancestors are always left open.

The tree is rebuilt asynchronously after each `nav`, and the stock explorer
already force-opens the current page's ancestors on re-render; a
`MutationObserver` re-syncs the button's icon and label whenever the tree or a
folder class changes, so the toggle stays accurate without depending on event
ordering. `styles.css` positions the button in the header and hides it when the
explorer is folded or on the mobile overlay. `htmlPlugins()` is a no-op that
exists only because the loader requires at least one processing hook to accept
the plugin as a transformer.

## Files

- `index.js` — manifest, CSS and client-script injection.
- `styles.css` — header placement and button styling.
- `client.js` — button injection, state application and persistence.
