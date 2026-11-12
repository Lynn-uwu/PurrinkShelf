import openpyxl, html, sys, json
wb = openpyxl.load_workbook('shots10/edited.xlsx')
def table(ws, cols, sel=None, drop=None, rows=14, widths=None, title=''):
    hdr = [c.value for c in ws[1]]
    idx = [hdr.index(c) for c in cols]
    L = lambda i: (chr(65+i) if i < 26 else chr(64+i//26)+chr(65+i%26))
    out = ['<table><tr><th class=n></th>' + ''.join(f'<th style="width:{(widths or {}).get(c,120)}px">{L(i)}</th>' for c,i in zip(cols,idx)) + '</tr>']
    for r, row in enumerate(ws.iter_rows(min_row=1, max_row=rows, values_only=True), 1):
        tds = []
        for c, i in zip(cols, idx):
            v = row[i] if i < len(row) else None
            cls = 'h' if r == 1 else ''
            inner = html.escape(str(v)) if v is not None else ''
            if sel and r == sel[0] and c == sel[1]:
                cls += ' s'
                inner = f'<div class=cellwrap>{inner}<span class=arrow>▾</span>' + (f'<div class=drop>{"".join(f"<div class=opt{chr(32)+chr(111)+chr(110) if o==v else chr(32)}>{html.escape(o)}</div>" for o in drop)}</div>' if drop else '') + '</div>'
            tds.append(f'<td class="{cls}">{inner}</td>')
        out.append(f'<tr><td class=n>{r}</td>{"".join(tds)}</tr>')
    return ''.join(out) + '</table>'
lists = wb['Lists']
lh = [c.value for c in lists[1]]
col = lambda name: [r[lh.index(name)] for r in lists.iter_rows(min_row=2, values_only=True) if r[lh.index(name)]]
CSS = '''<style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#fff}table{border-collapse:collapse;font-size:13px;table-layout:fixed}
th{background:#f3f3f3;border:1px solid #d4d4d4;font-weight:normal;color:#444;height:22px}td{border:1px solid #e1e1e1;height:24px;padding:0 6px;white-space:nowrap;overflow:visible;position:relative}
td.n{background:#f3f3f3;color:#444;text-align:center;width:34px}td.h{font-weight:bold;background:#e8f1ea}td.s{outline:2px solid #217346;outline-offset:-2px;background:#fff}
.cellwrap{position:relative}.arrow{position:absolute;right:-4px;top:-2px;border:1px solid #999;background:#f6f6f6;width:16px;text-align:center;font-size:11px}
.drop{position:absolute;left:-7px;top:22px;width:190px;background:#fff;border:1px solid #888;box-shadow:2px 3px 8px rgba(0,0,0,.25);z-index:9;max-height:260px;overflow:hidden}
.opt{padding:3px 8px}.opt.on{background:#cfe3d6}.tabs{display:flex;gap:2px;border-top:1px solid #ccc;background:#f3f3f3;font-size:13px}.tab{padding:6px 18px}.tab.on{background:#fff;border-bottom:3px solid #217346;font-weight:bold;color:#217346}
.bar{background:#217346;color:#fff;padding:8px 14px;font-size:14px}.fx{display:flex;align-items:center;border-bottom:1px solid #ccc;font-size:13px;padding:5px 8px;gap:10px}.box{border:1px solid #bbb;padding:2px 10px;width:50px}</style>'''
def page(body, cell, val, active):
    tabs = ''.join(f'<div class="tab{" on" if t==active else ""}">{t}</div>' for t in ['Books','Collections','Lists'])
    return f'<html><body>{CSS}<div class=bar>InkShelf books.xlsx &nbsp;-&nbsp; Excel</div><div class=fx><span class=box>{cell}</span><i>fx</i><span>{html.escape(val)}</span></div><div style="height:390px;overflow:hidden">{body}</div><div class=tabs>{tabs}</div></body></html>'
b = wb['Books']
cols = ['Title','Category 1','Genre 1','Genre 2','Tag 1','Tag 2','Tag 3','Reading','Favourite','Add to collection 1']
w = {'Title':230,'Category 1':120,'Genre 1':95,'Genre 2':95,'Tag 1':110,'Tag 2':110,'Tag 3':110,'Reading':105,'Favourite':80,'Add to collection 1':140}
open('shots10/x1.html','w').write(page(table(b, cols, sel=(2,'Tag 2'), drop=col('Tags')[:12], widths=w), 'M2', 'Clockwork', 'Books'))
open('shots10/x2.html','w').write(page(table(b, cols, sel=(2,'Reading'), drop=col('Reading'), widths=w), 'W2', 'Completed', 'Books'))
c = wb['Collections']
cc = ['Name','Match','Rule 1 check','Rule 1 is','Rule 1 value','Rule 2 check','Rule 2 is','Rule 2 value']
cw = {'Name':150,'Match':130,'Rule 1 check':130,'Rule 1 is':80,'Rule 1 value':130,'Rule 2 check':130,'Rule 2 is':80,'Rule 2 value':130}
open('shots10/x3.html','w').write(page(table(c, cc, sel=(5,'Rule 1 check'), drop=col('Rule: check'), widths=cw, rows=8), 'C5', 'Genre', 'Collections'))
print('ok')
