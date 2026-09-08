# PracticeTab Help Markdown Guide

The in-app Help modal loads markdown files from `src/help/`. This document lives
in `docs/` and is not shown in-app.

## Where Help Files Live

- In-app help files: `src/help/*.md`
- Documentation: `docs/HELP_MARKDOWN.md` (this file)

## Syntax

### Underline

Use `==text==` to underline inline text.

Example:

```
Use ==underlined== text in a sentence.
```

### Collapse Blocks

Use a collapse block with a heading as the first non-empty line:

```
:::collapse
# Heading text
Body content with *markdown*.
:::
```

### Images (Offline)

Images must use local/offline paths (no `http://` or `https://`). Store image
files under `src/help/images/` and reference them like:

```
![Alt text](./images/example.png)
```

Optional size (px only) can be added after the path:

```
![Alt text](./images/example.png =240px)
```

See `src/help/FAQ.md` for the current examples.

### Media Blocks (Image + Text Side-by-Side)

Use a media block to place an image on the left or right with markdown text
flowing next to it.

```
:::media[left]
![Alt text](./images/example.png =240px)
Your **markdown** text here.
:::
```

Right-aligned image:

```
:::media[right]
![Alt text](./images/example.png =240px)
Your **markdown** text here.
:::
```

```
![Alt text](./images/example.png)
```

### Links

Standard markdown links are supported:

```
[Visit](https://example.com)
```

### Indentation and Lists

Nested lists and blockquotes are supported:

```
- Item 1
  - Item 1.1
    - Item 1.1.1

> A blockquote with indentation.
```

## Notes

- `==underline==` tokens should be closed on the same line.
- `:::collapse` blocks should start with a heading and end with `:::`.
- `:::media[left]` and `:::media[right]` should start with an image line.
- Images should be local files (offline-first).
