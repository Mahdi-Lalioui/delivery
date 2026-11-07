# M2 geography evidence

`docker compose ps` showed PostGIS, Martin and OSRM healthy. The seed and integration tests used the Docker PostGIS service and disposable databases.

- Fixture tests passed 3/3. They checked all national codes and centroids, and all 57 Algiers boundaries and bilingual gazette labels.
- Real PostGIS geography tests passed 2/2. They verified 69 wilayas and 1,541 communes, 57 valid Algiers MultiPolygons, unchanged commune IDs after concurrent reseeding, and full rollback after an injected commune constraint failure.
- A separate PostGIS query found no positive-area overlap among distinct Algiers commune polygons.
- Reassembling the pinned OpenStreetMap extract reproduced the source GeoJSON. The generator’s `--check` mode reproduced all three fixture files byte-for-byte. [Pinned inputs, commands and attribution](../../../packages/db/fixtures/geography/README.md)
- The source and compiled seed commands both passed on a separate pinned Docker container. A second seed preserved all 1,541 IDs. The command refused a test database URL. The guarded development reset retained empty migrated tables.
