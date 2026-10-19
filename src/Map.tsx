import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { MapLocation } from "./placeSearch";
import type { Entry } from "./domain";
import "leaflet/dist/leaflet.css";
function pinIcon(className: string, color: string) {
  return L.divIcon({
    className,
    html: `<svg width="28" height="38" viewBox="0 0 28 38" aria-hidden="true"><path d="M14 37C11 31 1 22 1 14a13 13 0 0 1 26 0c0 8-10 17-13 23Z" fill="${color}" stroke="white" stroke-width="2"/><circle cx="14" cy="14" r="4" fill="white"/></svg>`,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    popupAnchor: [0, -34],
  });
}
const icon = pinIcon("town-pin", "#2b644e");
const searchIcon = pinIcon("search-pin", "#a34d19");
const currentIcon = pinIcon("current-pin", "#236baf");
function ViewLocation({ location }: { location?: MapLocation & { current?: boolean } }) {
  const map = useMap();
  useEffect(() => {
    if (location) map.setView([location.lat, location.lng], 16);
  }, [location, map]);
  return location ? <Marker position={[location.lat, location.lng]} icon={location.current ? currentIcon : searchIcon} title={location.current ? "現在地" : "検索地点"}><Popup>{location.label}</Popup></Marker> : null;
}
function Picker({
  position,
  onPick,
}: {
  position?: [number, number];
  onPick?: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng) });
  useEffect(() => {
    if (position) map.panTo(position);
  }, [position?.[0], position?.[1], map]);
  return position ? (
    <Marker
      icon={icon}
      position={position}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const p = e.target.getLatLng();
          onPick?.(p.lat, p.lng);
        },
      }}
    />
  ) : null;
}
export default function TownMap({
  entries,
  onSelect,
  position,
  onPick,
  location,
}: {
  location?: MapLocation & { current?: boolean };
  entries: Entry[];
  onSelect: (e: Entry) => void;
  position?: [number, number];
  onPick?: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer
      center={[35.681, 139.767]}
      zoom={14}
      scrollWheelZoom={false}
      className="map"
      aria-label="街歩き地図"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      {entries.map((e) => (
        <Marker
          key={e.id}
          icon={icon}
          position={[e.lat, e.lng]}
          eventHandlers={{ click: () => onSelect(e) }}
        >
          <Popup>
            <button onClick={() => onSelect(e)}>{e.title}</button>
          </Popup>
        </Marker>
      ))}
      <ViewLocation location={location} />
      <Picker position={position} onPick={onPick} />
    </MapContainer>
  );
}
