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
import type { Entry } from "./domain";
import "leaflet/dist/leaflet.css";
const icon = L.divIcon({
  className: "town-pin",
  html: "<span>●</span>",
  iconSize: [32, 40],
  iconAnchor: [16, 36],
});
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
}: {
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
      <Picker position={position} onPick={onPick} />
    </MapContainer>
  );
}
