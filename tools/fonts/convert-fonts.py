"""Converts OFL fonts (TrueType) into three.js typeface JSON for text-sketch.html.

Usage, from the repo root:
  pip install fonttools skia-pathops
  # put the TTFs in tools/fonts/ttf/ (from github.com/google/fonts, ofl/<family>/):
  #   ibmplexmono/IBMPlexMono-Italic.ttf,
  #   dmserifdisplay/DMSerifDisplay-Regular.ttf
  python3 tools/fonts/convert-fonts.py
Writes vendor/fonts/typeface/*.typeface.json. Variable fonts are instanced with overlaps
removed, and outlines are turned counter-clockwise (outer) with counters the other way, so counters (p, o, B) stay open in three.js.
"""
import os
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.join(HERE,'..','..')
import json,sys
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.varLib import instancer
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.areaPen import AreaPen
from pathops import Path as PPath
class P(BasePen):
    def __init__(s,gs):
        super().__init__(gs); s.o=[]
    def r(s,v): return str(round(v))
    def _moveTo(s,p): s.o+=['m',s.r(p[0]),s.r(p[1])]
    def _lineTo(s,p): s.o+=['l',s.r(p[0]),s.r(p[1])]
    def _qCurveToOne(s,c,p): s.o+=['q',s.r(p[0]),s.r(p[1]),s.r(c[0]),s.r(c[1])]
    def _curveToOne(s,c1,c2,p): s.o+=['b',s.r(p[0]),s.r(p[1]),s.r(c1[0]),s.r(c1[1]),s.r(c2[0]),s.r(c2[1])]
    def _closePath(s): pass
def conv(path,out,family,weight=None,style='normal'):
    if not os.path.exists(path):
        print('skip (no TTF):',path); return
    f=TTFont(path)
    if weight is not None and 'fvar' in f:
        f=instancer.instantiateVariableFont(f,{'wght':weight},overlap=instancer.OverlapMode.REMOVE)
    gs=f.getGlyphSet(); cmap=f.getBestCmap(); hm=f['hmtx']
    chars=[chr(c) for c in range(32,127)]+list("£€éèêáàâíóôúüçñöäß’‘“”–—…·×")
    # Every glyph is run through pathops first: overlapping contours are merged and the
    # winding made consistent (outer one way, every counter the other), so letters with
    # several counters (B, 8, g, &, %) are read correctly by three.js, not just o / p / e.
    def clean(g):
        pp=PPath(); gs[g].draw(pp.getPen(glyphSet=gs))
        pp.simplify(fix_winding=True, keep_starting_points=False)
        return pp
    ap=AreaPen(None); clean(cmap[ord('o')]).draw(ap)
    flip = ap.value < 0  # three.js wants outer contours counter-clockwise (y up) and every counter the other way
    glyphs={}
    for ch in chars:
        g=cmap.get(ord(ch))
        if not g: continue
        pen=P(gs); clean(g).draw(ReverseContourPen(pen) if flip else pen)
        xs=[float(v) for i,v in enumerate(pen.o) if False]
        adv=hm[g][0]
        b=f['glyf'][g] if 'glyf' in f else None
        try: xmin=b.xMin; xmax=b.xMax
        except Exception: xmin=0; xmax=adv
        glyphs[ch]={'ha':adv,'x_min':xmin,'x_max':xmax,'o':' '.join(pen.o)}
    head=f['head']; post=f['post']; hhea=f['hhea']
    data={'glyphs':glyphs,'familyName':family,'ascender':hhea.ascent,'descender':hhea.descent,
      'underlinePosition':post.underlinePosition,'underlineThickness':post.underlineThickness,
      'boundingBox':{'yMin':head.yMin,'xMin':head.xMin,'yMax':head.yMax,'xMax':head.xMax},
      'resolution':head.unitsPerEm,'original_font_information':{'licence':'SIL Open Font License 1.1 (see OFL.txt)'},
      'cssFontWeight':'bold' if (weight or 400)>=600 else 'normal','cssFontStyle':style}
    json.dump(data,open(out,'w'),separators=(',',':'))
    print(out,len(glyphs))
OUT=os.path.join(ROOT,'vendor','fonts','typeface'); TTF=os.path.join(HERE,'ttf'); os.makedirs(OUT,exist_ok=True)
conv(os.path.join(TTF,'ibmplexmono_IBMPlexMono-Italic.ttf'),os.path.join(OUT,'ibm-plex-mono-italic.typeface.json'),'IBM Plex Mono',None,'italic')
conv(os.path.join(TTF,'dmserifdisplay_DMSerifDisplay-Regular.ttf'),os.path.join(OUT,'dm-serif-display.typeface.json'),'DM Serif Display')
# Second set (29 Oct 2026): grotesque, blackletter, brush script, mono. All SIL OFL, from github.com/google/fonts ofl/<family>/.
for slug,fam,fn,wt in [
  ('archivo-black','Archivo Black','archivoblack_ArchivoBlack-Regular.ttf',None),
  ('anton','Anton','anton_Anton-Regular.ttf',None),
  ('space-grotesk-bold','Space Grotesk','spacegrotesk_SpaceGrotesk-VF.ttf',700),   # SpaceGrotesk[wght].ttf
  ('unifraktur-maguntia','UnifrakturMaguntia','unifrakturmaguntia_UnifrakturMaguntia-Book.ttf',None),
  ('pirata-one','Pirata One','pirataone_PirataOne-Regular.ttf',None),
  ('kaushan-script','Kaushan Script','kaushanscript_KaushanScript-Regular.ttf',None),
  ('caveat-brush','Caveat Brush','caveatbrush_CaveatBrush-Regular.ttf',None),
  ('space-mono-bold','Space Mono','spacemono_SpaceMono-Bold.ttf',None),
  ('dm-mono-medium','DM Mono','dmmono_DMMono-Medium.ttf',None),
  ('tomorrow-bold','Tomorrow','tomorrow_Tomorrow-Bold.ttf',None),
  ('major-mono-display','Major Mono Display','majormonodisplay_MajorMonoDisplay-Regular.ttf',None),
]:
    conv(os.path.join(TTF,fn),os.path.join(OUT,slug+'.typeface.json'),fam,wt)
