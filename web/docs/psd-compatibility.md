# PSD compatibility

Photo Studio reads PSD and PSB documents and exports PSD. Compatibility depends on the features used in the file; opening a document does not establish that every feature stored in it remains editable.

- Supported pixel layers, groups, text, shapes, adjustments and masks may remain editable. Some layer effects, fill types and text layouts are rasterized on export.
- Unsupported content may open as the document's saved composite preview. The application displays a compatibility notice rather than silently treating that preview as editable layers.
- The original PSD is retained when a document uses the compatibility preview. An unchanged document can download the original bytes. Editing that preview does not produce a layered PSD equivalent to the original.
- Native `.photo` projects preserve the application's own document state and are recommended for continuing work. Keep the original PSD or PSB as a separate copy.
- RGB documents at 8, 16 and 32 bits per channel are supported, with limits described in the main README. Pixel painting and some destructive operations use 8-bit layers.
- Native projects can retain features that PSD export omits, including comments, some vector masks, animation state and other application-specific data. Check the save/export notice before choosing a format.

For interoperability testing, `npm run psd:audit -- <sample-directory> [file-count] [output-directory]` compares import, rendering and round-trip data. Its generated outputs belong in `test-results/psd-audit/` and are not part of the source release. A passing internal round trip does not establish rendering fidelity in another editor.
