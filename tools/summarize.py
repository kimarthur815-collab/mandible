import json, collections, sys
r = json.load(open('hits.json'))
M = r['meshes']; H = r['hits']
def mname(i): m = M[i]; return f"{m['room'] or '?'}:{m['color']}:{m['side']}"
def world(h):
    ax, off, u, v = h['ax'], h['off'], h['u'], h['v']
    if ax == 0: return (off, u, v)
    if ax == 1: return (u, off, v)
    return (u, v, off)
cl = collections.defaultdict(lambda: [0, 0, set()])
for h in H:
    x, y, z = world(h)
    if h['ax'] == 1 and h['sg'] < 0 and y < 0.01: continue
    a, b = sorted([mname(h['m1']), mname(h['m2'])])
    c = (a + '|' + b, round(x / 2) * 2, round(z / 2) * 2)
    cl[c][0] += h['area']; cl[c][1] += 1; cl[c][2].add(('xyz'[h['ax']] + ('+' if h['sg'] > 0 else '-'), round([x, y, z][h['ax']], 3), round(y, 2)))
items = sorted(cl.items(), key=lambda kv: -kv[1][0])
print(len(items))
for k, v in items[:int(sys.argv[1]) if len(sys.argv) > 1 else 50]: print(round(v[0], 3), v[1], k, sorted(v[2])[:5])
