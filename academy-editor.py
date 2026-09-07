#!/usr/bin/env python3
"""
Alberta AI Academy — Content Editor
Single-file Python/tkinter desktop app for creating and editing Academy
content items (article, video, module, tool, download).
Exports JSON arrays compatible with the level JSON schema.

Run:  py academy-editor.py
"""

import json
import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from tkinter.scrolledtext import ScrolledText

# ─────────────────────────────── constants ────────────────────────────────────

ITEM_TYPES  = ["article", "video", "module", "tool", "download"]
DIFFICULTIES = ["beginner", "intermediate", "advanced"]
BLOCK_TYPES  = ["text", "list", "image", "video", "quiz"]

TYPE_COLORS = {
    "article":  "#2563eb",
    "video":    "#7c3aed",
    "module":   "#059669",
    "tool":     "#d97706",
    "download": "#dc2626",
}

# ─────────────────────────────── data helpers ─────────────────────────────────

def blank_item(itype: str) -> dict:
    return {
        "id": "", "title": "", "type": itype,
        "description": "", "longDescription": "",
        "imageUrl": "", "youtubeId": None, "url": None,
        "downloadUrl": None, "fileType": None, "fileSize": None,
        "source": "Alberta AI Academy", "tags": [],
        "duration": "", "difficulty": "beginner",
        "featured": False, "day": 1,
        "learningOutcomes": [], "sections": [],
    }


def blank_section() -> dict:
    return {"title": "New Section", "content": []}


def blank_block(btype: str) -> dict:
    if btype == "text":  return {"type": "text", "content": ""}
    if btype == "list":  return {"type": "list", "items": []}
    if btype == "image": return {"type": "image", "url": "", "alt": ""}
    if btype == "video": return {"type": "video", "url": "", "caption": ""}
    if btype == "quiz":
        return {
            "type": "quiz", "question": "",
            "options": ["A. ", "B. ", "C. ", "D. "],
            "correctAnswer": "A. ", "explanation": "",
        }
    return {"type": btype}


def block_label(b: dict) -> str:
    t = b.get("type", "?")
    if t == "text":   return f"[text]  {b.get('content','')[:50].replace(chr(10),' ')}"
    if t == "list":   return f"[list]  {len(b.get('items',[]))} item(s)"
    if t == "image":  return f"[image] {b.get('url','')[:50]}"
    if t == "video":  return f"[video] {b.get('url','')[:50]}"
    if t == "quiz":   return f"[quiz]  {b.get('question','')[:50]}"
    return f"[{t}]"


def normalize_item(raw: dict) -> dict:
    base = blank_item(raw.get("type", "article"))
    base.update(raw)
    if not isinstance(base["tags"], list):
        base["tags"] = [t.strip() for t in str(base["tags"]).split(",") if t.strip()]
    if not isinstance(base["learningOutcomes"], list):
        base["learningOutcomes"] = []
    if not isinstance(base["sections"], list):
        base["sections"] = []
    return base


# ─────────────────────────────── main app ─────────────────────────────────────

class AcademyEditor:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Alberta AI Academy — Content Editor")
        self.root.geometry("1340x860")
        self.root.minsize(920, 640)

        self.items: list = []
        self.sel_item:    int | None = None
        self.sel_section: int | None = None
        self.sel_block:   int | None = None
        self._guard = False          # re-entrancy guard for treeview selection

        # Per-editor state (reset each time an item is loaded)
        self._fv:   dict = {}        # StringVar / BooleanVar per common field
        self._tw:   dict = {}        # ScrolledText widgets per text field
        self._sec_title_var: tk.StringVar | None = None
        self._block_widgets: dict = {}
        self._sec_lb:            tk.Listbox | None = None
        self._block_lb:          tk.Listbox | None = None
        self._block_editor_frame: tk.Frame | None = None

        self._build_ui()
        self.root.bind("<Control-s>", lambda _: self._export_json())

    # ──────────────────────────── top-level UI ────────────────────────────────

    def _build_ui(self):
        self._build_toolbar()
        pw = tk.PanedWindow(self.root, orient=tk.HORIZONTAL,
                            sashwidth=6, sashrelief=tk.RAISED)
        pw.pack(fill=tk.BOTH, expand=True, pady=(0, 0))

        left = tk.Frame(pw, width=270)
        pw.add(left, minsize=180)
        self._build_item_list(left)

        self._editor_outer = tk.Frame(pw)
        pw.add(self._editor_outer, minsize=620)
        self._show_empty_editor()

    # ── Toolbar ──

    def _build_toolbar(self):
        tb = tk.Frame(self.root, relief=tk.RAISED, bd=1, pady=3)
        tb.pack(fill=tk.X, padx=4, pady=4)

        for t in ITEM_TYPES:
            bg = TYPE_COLORS[t]
            tk.Button(tb, text=f"+ {t.capitalize()}", bg=bg, fg="white",
                      relief=tk.FLAT, padx=8,
                      command=lambda it=t: self._add_item(it)
                      ).pack(side=tk.LEFT, padx=2)

        tk.Frame(tb, width=14).pack(side=tk.LEFT)
        tk.Button(tb, text="Open JSON",   command=self._open_json,   padx=6
                  ).pack(side=tk.LEFT, padx=2)
        tk.Button(tb, text="Export JSON (Ctrl+S)", command=self._export_json,
                  bg="#1d4ed8", fg="white", padx=6
                  ).pack(side=tk.LEFT, padx=2)
        tk.Button(tb, text="Delete Selected", command=self._delete_item,
                  bg="#b91c1c", fg="white", padx=6
                  ).pack(side=tk.LEFT, padx=2)

        self._status = tk.StringVar(value="Ready — create or open items.")
        tk.Label(tb, textvariable=self._status, fg="#555", anchor="e"
                 ).pack(side=tk.RIGHT, padx=10)

    # ── Item list (left pane) ──

    def _build_item_list(self, parent):
        hdr = tk.Frame(parent, bg="#e2e8f0")
        hdr.pack(fill=tk.X)
        tk.Label(hdr, text="  ITEMS", font=("", 10, "bold"),
                 bg="#e2e8f0", anchor="w").pack(fill=tk.X, pady=3)

        cols = ("type", "title")
        tv = ttk.Treeview(parent, columns=cols, show="headings",
                          selectmode="browse")
        tv.heading("type",  text="Type")
        tv.heading("title", text="Title")
        tv.column("type",  width=58,  anchor="center")
        tv.column("title", width=200, anchor="w")
        sb = ttk.Scrollbar(parent, orient=tk.VERTICAL, command=tv.yview)
        tv.configure(yscrollcommand=sb.set)
        sb.pack(side=tk.RIGHT, fill=tk.Y)
        tv.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
        tv.bind("<<TreeviewSelect>>", self._on_item_select)
        self._tv = tv

    def _refresh_tv(self):
        self._tv.delete(*self._tv.get_children())
        for item in self.items:
            t     = item.get("type", "?")[:3]
            title = item.get("title", "(untitled)")[:55]
            self._tv.insert("", tk.END, values=(t, title))

    def _tv_select(self, idx: int):
        children = self._tv.get_children()
        if idx < len(children):
            self._tv.selection_set(children[idx])
            self._tv.focus(children[idx])
            self._tv.see(children[idx])

    # ── Item CRUD ──

    def _add_item(self, itype: str):
        self._save_form()
        item = blank_item(itype)
        self.items.append(item)
        self._refresh_tv()
        new_idx = len(self.items) - 1
        self._load_editor(new_idx)
        self._tv_select(new_idx)
        self._set_status()

    def _delete_item(self):
        if self.sel_item is None:
            return
        title = self.items[self.sel_item].get("title") or "(untitled)"
        if not messagebox.askyesno("Delete", f"Delete item:\n'{title}'?"):
            return
        self.items.pop(self.sel_item)
        self.sel_item = self.sel_section = self.sel_block = None
        self._refresh_tv()
        self._show_empty_editor()
        self._set_status()

    def _on_item_select(self, _event=None):
        if self._guard:
            return
        sel = self._tv.selection()
        if not sel:
            return
        idx = list(self._tv.get_children()).index(sel[0])
        if idx == self.sel_item:
            return
        self._save_form()
        self._load_editor(idx)

    def _set_status(self):
        n = len(self.items)
        self._status.set(f"{n} item{'s' if n != 1 else ''} in editor")

    # ──────────────────────────── editor container ────────────────────────────

    def _show_empty_editor(self):
        for w in self._editor_outer.winfo_children():
            w.destroy()
        tk.Label(self._editor_outer,
                 text="Select or create an item to begin editing.",
                 fg="#94a3b8", font=("", 13)).pack(expand=True)

    def _load_editor(self, idx: int):
        self.sel_item    = idx
        self.sel_section = None
        self.sel_block   = None
        self._fv.clear();  self._tw.clear();  self._block_widgets.clear()
        self._sec_title_var = self._sec_lb = self._block_lb = None
        self._block_editor_frame = None

        for w in self._editor_outer.winfo_children():
            w.destroy()

        # Scrollable canvas wrapper
        canvas = tk.Canvas(self._editor_outer, highlightthickness=0,
                           bg="#f8fafc")
        vsb = ttk.Scrollbar(self._editor_outer, orient=tk.VERTICAL,
                            command=canvas.yview)
        canvas.configure(yscrollcommand=vsb.set)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        form = tk.Frame(canvas, bg="#f8fafc")
        win_id = canvas.create_window((0, 0), window=form, anchor="nw")

        def _on_form_resize(_e):
            canvas.configure(scrollregion=canvas.bbox("all"))

        def _on_canvas_resize(e):
            canvas.itemconfig(win_id, width=e.width)

        def _scroll(e):
            canvas.yview_scroll(-1 * (e.delta // 120), "units")

        form.bind("<Configure>", _on_form_resize)
        canvas.bind("<Configure>", _on_canvas_resize)
        canvas.bind("<MouseWheel>", _scroll)
        form.bind_all("<MouseWheel>", _scroll)   # catch child widgets too

        self._form = form
        self._build_form(form, self.items[idx])

    # ──────────────────────────── form builder ────────────────────────────────

    def _build_form(self, p: tk.Frame, item: dict):
        itype = item.get("type", "article")
        p.columnconfigure(1, weight=1)
        row = [0]

        BG = "#f8fafc"

        def lbl(text, r, col=0, **kw):
            tk.Label(p, text=text, anchor="w", bg=BG, **kw
                     ).grid(row=r, column=col, sticky="nw",
                            padx=(8, 2), pady=3)

        def entry(label, key, width=60):
            v = tk.StringVar(value=str(item.get(key) or ""))
            self._fv[key] = v
            lbl(label, row[0])
            tk.Entry(p, textvariable=v, width=width
                     ).grid(row=row[0], column=1, sticky="ew",
                            padx=6, pady=3)
            row[0] += 1

        def textarea(label, key, height=4):
            lbl(label, row[0])
            t = ScrolledText(p, height=height, width=60, wrap=tk.WORD)
            val = item.get(key)
            if isinstance(val, list):
                t.insert("1.0", "\n".join(val))
            else:
                t.insert("1.0", str(val or ""))
            t.grid(row=row[0], column=1, sticky="ew", padx=6, pady=3)
            self._tw[key] = t
            row[0] += 1

        def combo(label, key, values, width=22):
            v = tk.StringVar(value=str(item.get(key) or values[0]))
            self._fv[key] = v
            lbl(label, row[0])
            ttk.Combobox(p, textvariable=v, values=values,
                         state="readonly", width=width
                         ).grid(row=row[0], column=1, sticky="w",
                                padx=6, pady=3)
            row[0] += 1

        def check(label, key):
            v = tk.BooleanVar(value=bool(item.get(key, False)))
            self._fv[key] = v
            lbl(label, row[0])
            tk.Checkbutton(p, variable=v, bg=BG
                           ).grid(row=row[0], column=1, sticky="w",
                                  padx=6, pady=3)
            row[0] += 1

        def sep():
            ttk.Separator(p, orient="horizontal").grid(
                row=row[0], column=0, columnspan=2,
                sticky="ew", padx=6, pady=6)
            row[0] += 1

        # ── Type badge ──
        bg = TYPE_COLORS.get(itype, "#333")
        tk.Label(p, text=f"  {itype.upper()}  ", bg=bg, fg="white",
                 font=("", 12, "bold"), padx=10, pady=5
                 ).grid(row=row[0], column=0, columnspan=2,
                        sticky="w", padx=8, pady=(8, 6))
        row[0] += 1

        # ── Common fields ──
        entry("ID",         "id")
        entry("Title",      "title")
        textarea("Description", "description", height=3)
        entry("Source",     "source")
        combo("Difficulty", "difficulty", DIFFICULTIES)
        entry("Duration",   "duration", width=24)

        self._fv["day"] = tk.StringVar(value=str(item.get("day", 1)))
        lbl("Day", row[0])
        tk.Entry(p, textvariable=self._fv["day"], width=8
                 ).grid(row=row[0], column=1, sticky="w", padx=6, pady=3)
        row[0] += 1

        self._fv["tags"] = tk.StringVar(
            value=", ".join(item.get("tags") or []))
        lbl("Tags (comma-sep)", row[0])
        tk.Entry(p, textvariable=self._fv["tags"], width=60
                 ).grid(row=row[0], column=1, sticky="ew", padx=6, pady=3)
        row[0] += 1

        entry("Image URL",  "imageUrl")
        entry("Main URL",   "url")
        check("Featured",   "featured")
        sep()

        # ── Type-specific ──
        if itype in ("article", "video", "module"):
            textarea("Long Description (Markdown)", "longDescription", height=10)

        if itype == "video":
            entry("YouTube ID", "youtubeId", width=32)

        if itype == "download":
            entry("Download URL", "downloadUrl")
            entry("File Type",    "fileType",    width=24)
            entry("File Size",    "fileSize",    width=24)

        if itype == "module":
            textarea("Learning Outcomes (one per line)",
                     "learningOutcomes", height=5)

        sep()

        if itype == "module":
            self._build_sections_panel(p, item, row)

    # ──────────────────────────── sections editor ─────────────────────────────

    def _build_sections_panel(self, p: tk.Frame, item: dict, row: list):
        tk.Label(p, text="SECTIONS", font=("", 11, "bold"),
                 fg="#059669", bg="#f8fafc", anchor="w"
                 ).grid(row=row[0], column=0, columnspan=2,
                        sticky="w", padx=8, pady=(0, 4))
        row[0] += 1

        outer = tk.Frame(p, relief=tk.GROOVE, bd=1)
        outer.grid(row=row[0], column=0, columnspan=2,
                   sticky="nsew", padx=6, pady=4)
        p.rowconfigure(row[0], weight=1)
        row[0] += 1

        pw = tk.PanedWindow(outer, orient=tk.HORIZONTAL, sashwidth=5)
        pw.pack(fill=tk.BOTH, expand=True)

        # ── Left: section list ──
        sec_panel = tk.Frame(pw, width=200)
        pw.add(sec_panel, minsize=150)

        tk.Label(sec_panel, text="Sections", font=("", 9, "bold")
                 ).pack(anchor="w", padx=4, pady=(4, 0))

        bf = tk.Frame(sec_panel)
        bf.pack(fill=tk.X, padx=2, pady=2)
        tk.Button(bf, text="+ Add",  width=7,
                  command=lambda: self._sec_add(item)).pack(side=tk.LEFT)
        tk.Button(bf, text="Del",    width=4, bg="#fee2e2",
                  command=lambda: self._sec_delete(item)).pack(side=tk.LEFT, padx=2)

        sec_lb = tk.Listbox(sec_panel, exportselection=False,
                            activestyle="none",
                            selectbackground="#bbf7d0",
                            selectforeground="#000")
        sec_sb = ttk.Scrollbar(sec_panel, command=sec_lb.yview)
        sec_lb.configure(yscrollcommand=sec_sb.set)
        sec_sb.pack(side=tk.RIGHT, fill=tk.Y)
        sec_lb.pack(fill=tk.BOTH, expand=True, padx=2, pady=2)
        self._sec_lb = sec_lb

        # ── Right: section content ──
        right = tk.Frame(pw)
        pw.add(right, minsize=420)
        right.columnconfigure(0, weight=1)

        # Section title row
        sf = tk.Frame(right)
        sf.pack(fill=tk.X, padx=4, pady=4)
        tk.Label(sf, text="Section Title:").pack(side=tk.LEFT)
        stv = tk.StringVar()
        self._sec_title_var = stv
        tk.Entry(sf, textvariable=stv, width=46
                 ).pack(side=tk.LEFT, padx=6, fill=tk.X, expand=True)

        ttk.Separator(right, orient="horizontal").pack(fill=tk.X, padx=4, pady=2)

        # Blocks header
        tk.Label(right, text="Content Blocks", font=("", 9, "bold"), anchor="w"
                 ).pack(fill=tk.X, padx=4)

        # Blocks list + buttons
        block_area = tk.Frame(right)
        block_area.pack(fill=tk.X, padx=4, pady=2)

        block_lb = tk.Listbox(block_area, width=44, height=7,
                              exportselection=False, activestyle="none",
                              selectbackground="#bfdbfe")
        blk_sb = ttk.Scrollbar(block_area, command=block_lb.yview)
        block_lb.configure(yscrollcommand=blk_sb.set)
        blk_sb.pack(side=tk.RIGHT, fill=tk.Y)
        block_lb.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self._block_lb = block_lb

        bb = tk.Frame(block_area)
        bb.pack(side=tk.LEFT, fill=tk.Y, padx=4)
        for bt in BLOCK_TYPES:
            tk.Button(bb, text=f"+{bt}", width=8,
                      command=lambda b=bt: self._block_add(item, b)
                      ).pack(pady=1, anchor="w")
        tk.Button(bb, text="↑", width=3,
                  command=lambda: self._block_move(item, -1)).pack(pady=1)
        tk.Button(bb, text="↓", width=3,
                  command=lambda: self._block_move(item,  1)).pack(pady=1)
        tk.Button(bb, text="Del", width=5, bg="#fee2e2",
                  command=lambda: self._block_delete(item)).pack(pady=1)

        # Block editor
        ttk.Separator(right, orient="horizontal").pack(fill=tk.X, padx=4, pady=4)
        tk.Label(right, text="Block Editor", font=("", 9, "bold"), anchor="w"
                 ).pack(fill=tk.X, padx=4)
        bef = tk.Frame(right, relief=tk.GROOVE, bd=1, height=220)
        bef.pack(fill=tk.BOTH, expand=True, padx=4, pady=(0, 6))
        bef.pack_propagate(False)
        self._block_editor_frame = bef

        # Wire events & populate
        self._sec_populate(item)
        sec_lb.bind("<<ListboxSelect>>",  lambda e: self._sec_select(item))
        block_lb.bind("<<ListboxSelect>>", lambda e: self._block_select(item))

        if item["sections"]:
            sec_lb.selection_set(0)
            self._sec_load(item, 0)

    # ── Section operations ──

    def _sec_populate(self, item: dict):
        if not self._sec_lb:
            return
        self._sec_lb.delete(0, tk.END)
        for i, s in enumerate(item["sections"]):
            self._sec_lb.insert(tk.END, f"{i+1}. {s.get('title','')}")

    def _sec_add(self, item: dict):
        self._sec_save_title(item)
        self._block_save(item)
        item["sections"].append(blank_section())
        self._sec_populate(item)
        new_idx = len(item["sections"]) - 1
        self._sec_lb.selection_set(new_idx)
        self._sec_load(item, new_idx)

    def _sec_delete(self, item: dict):
        if self.sel_section is None:
            return
        if not messagebox.askyesno("Delete Section",
                                   "Delete this section and all its blocks?"):
            return
        item["sections"].pop(self.sel_section)
        self.sel_section = self.sel_block = None
        self._sec_populate(item)
        if self._sec_title_var:
            self._sec_title_var.set("")
        if self._block_lb:
            self._block_lb.delete(0, tk.END)
        self._block_clear()

    def _sec_select(self, item: dict):
        self._sec_save_title(item)
        self._block_save(item)
        sel = self._sec_lb.curselection()
        if not sel:
            return
        self._sec_load(item, sel[0])

    def _sec_load(self, item: dict, idx: int):
        self.sel_section = idx
        self.sel_block   = None
        sec = item["sections"][idx]
        if self._sec_title_var:
            self._sec_title_var.set(sec.get("title", ""))
        self._block_populate(sec)
        self._block_clear()

    def _sec_save_title(self, item: dict):
        if (self.sel_section is None or
                self._sec_title_var is None or
                self.sel_section >= len(item["sections"])):
            return
        title = self._sec_title_var.get()
        item["sections"][self.sel_section]["title"] = title
        if self._sec_lb:
            self._sec_lb.delete(self.sel_section)
            self._sec_lb.insert(self.sel_section,
                                f"{self.sel_section+1}. {title}")
            self._sec_lb.selection_set(self.sel_section)

    # ── Block operations ──

    def _block_populate(self, sec: dict):
        if not self._block_lb:
            return
        self._block_lb.delete(0, tk.END)
        for b in sec.get("content", []):
            self._block_lb.insert(tk.END, block_label(b))

    def _block_select(self, item: dict):
        self._block_save(item)
        if self.sel_section is None:
            return
        sel = self._block_lb.curselection()
        if not sel:
            return
        self.sel_block = sel[0]
        block = item["sections"][self.sel_section]["content"][self.sel_block]
        self._block_build(block)

    def _block_add(self, item: dict, btype: str):
        if self.sel_section is None:
            messagebox.showinfo("", "Select a section first.")
            return
        self._block_save(item)
        block = blank_block(btype)
        item["sections"][self.sel_section]["content"].append(block)
        self._block_populate(item["sections"][self.sel_section])
        new_idx = len(item["sections"][self.sel_section]["content"]) - 1
        self._block_lb.selection_set(new_idx)
        self.sel_block = new_idx
        self._block_build(block)

    def _block_delete(self, item: dict):
        if self.sel_section is None or self.sel_block is None:
            return
        item["sections"][self.sel_section]["content"].pop(self.sel_block)
        self.sel_block = None
        self._block_populate(item["sections"][self.sel_section])
        self._block_clear()

    def _block_move(self, item: dict, direction: int):
        if self.sel_section is None or self.sel_block is None:
            return
        self._block_save(item)
        content = item["sections"][self.sel_section]["content"]
        idx, new_idx = self.sel_block, self.sel_block + direction
        if 0 <= new_idx < len(content):
            content[idx], content[new_idx] = content[new_idx], content[idx]
            self.sel_block = new_idx
            self._block_populate(item["sections"][self.sel_section])
            self._block_lb.selection_set(new_idx)

    def _block_clear(self):
        if self._block_editor_frame:
            for w in self._block_editor_frame.winfo_children():
                w.destroy()
        self._block_widgets.clear()

    def _block_build(self, block: dict):
        self._block_clear()
        f  = self._block_editor_frame
        if f is None:
            return
        f.columnconfigure(1, weight=1)
        bw = self._block_widgets
        bt = block.get("type")

        if bt == "text":
            tk.Label(f, text="Content (Markdown):"
                     ).grid(row=0, column=0, sticky="nw", padx=6, pady=6)
            t = ScrolledText(f, height=8, width=52, wrap=tk.WORD)
            t.insert("1.0", block.get("content", ""))
            t.grid(row=0, column=1, sticky="nsew", padx=6, pady=6)
            f.rowconfigure(0, weight=1)
            bw["content"] = t

        elif bt == "list":
            tk.Label(f, text="Items\n(one per line):"
                     ).grid(row=0, column=0, sticky="nw", padx=6, pady=6)
            t = ScrolledText(f, height=8, width=52, wrap=tk.WORD)
            t.insert("1.0", "\n".join(block.get("items", [])))
            t.grid(row=0, column=1, sticky="nsew", padx=6, pady=6)
            f.rowconfigure(0, weight=1)
            bw["items"] = t

        elif bt == "image":
            tk.Label(f, text="URL:"
                     ).grid(row=0, column=0, sticky="w", padx=6, pady=6)
            e_url = tk.Entry(f, width=56)
            e_url.insert(0, block.get("url", ""))
            e_url.grid(row=0, column=1, sticky="ew", padx=6, pady=6)
            bw["url"] = e_url

            tk.Label(f, text="Alt text:"
                     ).grid(row=1, column=0, sticky="w", padx=6, pady=4)
            e_alt = tk.Entry(f, width=56)
            e_alt.insert(0, block.get("alt", ""))
            e_alt.grid(row=1, column=1, sticky="ew", padx=6, pady=4)
            bw["alt"] = e_alt

        elif bt == "video":
            tk.Label(f, text="URL:"
                     ).grid(row=0, column=0, sticky="w", padx=6, pady=6)
            e_url = tk.Entry(f, width=56)
            e_url.insert(0, block.get("url", ""))
            e_url.grid(row=0, column=1, sticky="ew", padx=6, pady=6)
            bw["url"] = e_url

            tk.Label(f, text="Caption:"
                     ).grid(row=1, column=0, sticky="w", padx=6, pady=4)
            e_cap = tk.Entry(f, width=56)
            e_cap.insert(0, block.get("caption", ""))
            e_cap.grid(row=1, column=1, sticky="ew", padx=6, pady=4)
            bw["caption"] = e_cap

        elif bt == "quiz":
            opts = block.get("options", ["A. ", "B. ", "C. ", "D. "])

            tk.Label(f, text="Question:"
                     ).grid(row=0, column=0, sticky="nw", padx=6, pady=4)
            q_t = ScrolledText(f, height=3, width=52, wrap=tk.WORD)
            q_t.insert("1.0", block.get("question", ""))
            q_t.grid(row=0, column=1, sticky="ew", padx=6, pady=4)
            bw["question"] = q_t

            for i, opt in enumerate(opts):
                tk.Label(f, text=f"Option {chr(65+i)}:"
                         ).grid(row=1+i, column=0, sticky="w", padx=6, pady=2)
                e = tk.Entry(f, width=56)
                e.insert(0, opt)
                e.grid(row=1+i, column=1, sticky="ew", padx=6, pady=2)
                bw[f"opt_{i}"] = e

            r_ca = 1 + len(opts)
            tk.Label(f, text="Correct Answer:"
                     ).grid(row=r_ca, column=0, sticky="w", padx=6, pady=4)
            ca_var = tk.StringVar(value=block.get("correctAnswer", ""))
            bw["ca_var"] = ca_var
            ttk.Combobox(f, textvariable=ca_var, values=opts, width=32
                         ).grid(row=r_ca, column=1, sticky="w", padx=6, pady=4)

            r_ex = r_ca + 1
            tk.Label(f, text="Explanation:"
                     ).grid(row=r_ex, column=0, sticky="nw", padx=6, pady=4)
            exp_t = ScrolledText(f, height=3, width=52, wrap=tk.WORD)
            exp_t.insert("1.0", block.get("explanation", ""))
            exp_t.grid(row=r_ex, column=1, sticky="ew", padx=6, pady=4)
            bw["explanation"] = exp_t

    def _block_save(self, item: dict):
        if (self.sel_section is None or self.sel_block is None or
                self.sel_section >= len(item["sections"])):
            return
        sec = item["sections"][self.sel_section]
        if self.sel_block >= len(sec["content"]):
            return
        block = sec["content"][self.sel_block]
        bw = self._block_widgets
        if not bw:
            return
        bt = block.get("type")

        if bt == "text":
            if "content" in bw:
                block["content"] = bw["content"].get("1.0", tk.END).rstrip("\n")

        elif bt == "list":
            if "items" in bw:
                raw = bw["items"].get("1.0", tk.END).strip()
                block["items"] = [ln for ln in raw.splitlines() if ln.strip()]

        elif bt == "image":
            block["url"] = bw["url"].get()   if "url" in bw else block.get("url", "")
            block["alt"] = bw["alt"].get()   if "alt" in bw else block.get("alt", "")

        elif bt == "video":
            block["url"]     = bw["url"].get()     if "url"     in bw else block.get("url", "")
            block["caption"] = bw["caption"].get() if "caption" in bw else block.get("caption", "")

        elif bt == "quiz":
            if "question" in bw:
                block["question"] = bw["question"].get("1.0", tk.END).strip()
            opts = []
            for i in range(4):
                k = f"opt_{i}"
                opts.append(bw[k].get() if k in bw else "")
            block["options"]       = opts
            block["correctAnswer"] = bw["ca_var"].get() if "ca_var" in bw else ""
            if "explanation" in bw:
                block["explanation"] = bw["explanation"].get("1.0", tk.END).strip()

        # Refresh listbox entry label
        if self._block_lb:
            self._block_lb.delete(self.sel_block)
            self._block_lb.insert(self.sel_block, block_label(block))
            self._block_lb.selection_set(self.sel_block)

    # ──────────────────────────── form save ───────────────────────────────────

    def _save_form(self):
        """Flush all widget values back to self.items[sel_item]."""
        if self.sel_item is None or self.sel_item >= len(self.items):
            return
        item  = self.items[self.sel_item]
        itype = item.get("type", "article")

        # StringVar / BooleanVar fields
        ALWAYS_STR   = {"id", "title", "source", "duration", "imageUrl"}
        ALWAYS_NULL  = {"url", "youtubeId", "downloadUrl", "fileType", "fileSize"}

        for key, var in self._fv.items():
            if isinstance(var, tk.BooleanVar):
                item[key] = var.get()
            elif isinstance(var, tk.StringVar):
                val = var.get().strip()
                if key == "day":
                    try:
                        item["day"] = int(val)
                    except (ValueError, TypeError):
                        item["day"] = 1
                elif key == "tags":
                    item["tags"] = [t.strip() for t in val.split(",") if t.strip()]
                elif key == "difficulty":
                    item["difficulty"] = val
                elif key in ALWAYS_STR:
                    item[key] = val
                else:
                    item[key] = val if val else None

        # ScrolledText fields
        for key, widget in self._tw.items():
            raw = widget.get("1.0", tk.END).rstrip("\n")
            if key == "learningOutcomes":
                item[key] = [ln for ln in raw.splitlines() if ln.strip()]
            else:
                item[key] = raw

        # Module-specific: flush section title + current block
        if itype == "module":
            self._sec_save_title(item)
            self._block_save(item)

        # Refresh list silently
        self._guard = True
        self._refresh_tv()
        if self.sel_item is not None:
            self._tv_select(self.sel_item)
        self._guard = False

    # ──────────────────────────── file I/O ────────────────────────────────────

    def _export_json(self):
        self._save_form()
        if not self.items:
            messagebox.showinfo("Export", "Nothing to export.")
            return

        path = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
            initialfile="items-export.json",
        )
        if not path:
            return

        out = []
        for item in self.items:
            out.append({
                "id":               item.get("id", ""),
                "title":            item.get("title", ""),
                "type":             item.get("type", "article"),
                "description":      item.get("description", ""),
                "longDescription":  item.get("longDescription", ""),
                "imageUrl":         item.get("imageUrl") or "",
                "youtubeId":        item.get("youtubeId") or None,
                "url":              item.get("url") or None,
                "downloadUrl":      item.get("downloadUrl") or None,
                "fileType":         item.get("fileType") or None,
                "fileSize":         item.get("fileSize") or None,
                "source":           item.get("source", "Alberta AI Academy"),
                "tags":             item.get("tags", []),
                "duration":         item.get("duration", ""),
                "difficulty":       item.get("difficulty", "beginner"),
                "featured":         item.get("featured", False),
                "day":              item.get("day", 1),
                "learningOutcomes": item.get("learningOutcomes", []),
                "sections":         item.get("sections", []),
            })

        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2, ensure_ascii=False)

        self._status.set(
            f"Exported {len(out)} item(s) → {os.path.basename(path)}")
        messagebox.showinfo("Export",
                            f"Saved {len(out)} item(s) to:\n{path}")

    def _open_json(self):
        path = filedialog.askopenfilename(
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")])
        if not path:
            return

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            messagebox.showerror("Error", f"Could not read file:\n{e}")
            return

        if isinstance(data, list):
            raw_items = data
        elif isinstance(data, dict) and "items" in data:
            raw_items = data["items"]
        else:
            messagebox.showerror(
                "Error",
                "Expected a JSON array of items, or an object with an 'items' key.")
            return

        self._save_form()
        self.items = [normalize_item(i) for i in raw_items]
        self.sel_item = self.sel_section = self.sel_block = None
        self._refresh_tv()
        self._show_empty_editor()
        self._set_status()
        messagebox.showinfo(
            "Open",
            f"Loaded {len(self.items)} item(s) from:\n{os.path.basename(path)}")


# ──────────────────────────────── entry point ────────────────────────────────

def main():
    root = tk.Tk()
    try:
        # Slightly sharper scaling on high-DPI screens
        root.tk.call("tk", "scaling", 1.2)
    except Exception:
        pass
    AcademyEditor(root)
    root.mainloop()


if __name__ == "__main__":
    main()
