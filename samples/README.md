# Samples

Fictional documents for trying the app by hand ([`requests.http`](../apps/backend/requests.http)) and for the worker's and the end-to-end tests. Each one covers a different way the worker reads text:

| File          | What it is                                         | How the worker reads it                             |
| ------------- | -------------------------------------------------- | --------------------------------------------------- |
| `text.pdf`    | 2-page employment contract (English)               | Text layer, locally                                 |
| `scanned.pdf` | 2-page scanned invoice (German), no text layer     | OCR with Claude                                     |
| `mixed.pdf`   | Typed contract page, then a scanned signature page | Text layer only: the scanned page stays empty (MVP) |
| `photo.jpg`   | Photo of a café receipt (English)                  | OCR with Claude                                     |

Tests match on their content, so changing a sample means updating the tests that use it.
