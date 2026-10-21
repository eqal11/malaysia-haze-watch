"""Prepare fixed sampling locations and district/state membership, never synthesize observations."""
from utils import DATA, contains, locate, read, validate_geojson, write

def main():
    districts = validate_geojson(read(DATA/'boundaries/districts.geojson'))
    states = validate_geojson(read(DATA/'boundaries/states.geojson'))
    for f in districts['features']:
        # Majority of vertices gives reliable parent membership without relying on offshore centroids.
        polys = [f['geometry']['coordinates']] if f['geometry']['type']=='Polygon' else f['geometry']['coordinates']
        outer = max((p[0] for p in polys), key=len)
        votes = {}
        for point in outer[::max(1,len(outer)//25)]:
            parent = locate(point, states['features'])
            if parent:
                name = parent['properties']['name']
                votes[name] = votes.get(name,0)+1
        if not votes:
            raise ValueError('No parent state for district '+f['properties']['name'])
        f['properties']['state'] = max(votes, key=votes.get)
    write(DATA/'boundaries/districts.geojson',districts)
    # Sparse 1-degree land grid: browser makes two batched requests, not one per cell.
    points = []
    for x in range(99,120):
        for y in range(1,8):
            lng,lat = x+0.5,y+0.25
            state = locate([lng,lat], states['features'])
            if state:
                points.append({'lng':lng,'lat':lat,'state':state['properties']['name']})
    # Include representative capital/coastal points and small federal territories.
    for lng,lat in [(101.69,3.14),(100.33,5.41),(99.86,6.33),(115.23,5.30),(103.76,1.49),(116.07,5.98),(110.36,1.55),(101.69,2.93)]:
        state = locate([lng,lat],states['features'])
        if state:
            points.append({'lng':lng,'lat':lat,'state':state['properties']['name']})
    write(DATA/'sampling-grid.json',{'version':1,'points':points})
    print(f"Prepared {len(districts['features'])} districts; {len(points)} model sampling points")

if __name__=='__main__':
    main()
