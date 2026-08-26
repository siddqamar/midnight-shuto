import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { ROAD_SPACING, ROAD_WIDTH, WORLD_SIZE } from '../core/config';
import type { Weather } from '../core/types';
import { seededRandom } from '../utils/math';

function makeWindowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = '#17202a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 10; y < 250; y += 22) {
    for (let x = 8; x < 125; x += 24) {
      const lit = ((x * 13 + y * 7) % 11) > 4;
      context.fillStyle = lit ? '#d5c99b' : '#263746';
      context.fillRect(x, y, 12, 10);
      context.fillStyle = lit ? '#867f66' : '#111a22';
      context.fillRect(x, y + 8, 12, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeSignTexture(label: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = '#081018';
  context.fillRect(0, 0, 384, 128);
  context.strokeStyle = color;
  context.lineWidth = 7;
  context.strokeRect(7, 7, 370, 114);
  context.shadowColor = color;
  context.shadowBlur = 18;
  context.fillStyle = color;
  context.font = '700 54px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 192, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class City {
  readonly group = new THREE.Group();
  readonly rain: THREE.Points;
  private sun: THREE.DirectionalLight;
  private hemisphere: THREE.HemisphereLight;
  private roadMaterial: THREE.MeshStandardMaterial;
  private buildingMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshPhysicalMaterial;
  private rainPositions: Float32Array;

  constructor(scene: THREE.Scene, physics: CANNON.World, quality: 'performance' | 'balanced' | 'high') {
    scene.add(this.group);
    scene.background = new THREE.Color(0x111926);
    scene.fog = new THREE.FogExp2(0x111926, 0.0017);

    this.hemisphere = new THREE.HemisphereLight(0x9ec8ff, 0x34402b, 1.7);
    scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(0xffd7a3, 3.2);
    this.sun.position.set(-220, 360, -140);
    this.sun.castShadow = quality !== 'performance';
    this.sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    this.sun.shadow.camera.left = -80;
    this.sun.shadow.camera.right = 80;
    this.sun.shadow.camera.top = 80;
    this.sun.shadow.camera.bottom = -80;
    this.sun.shadow.camera.far = 650;
    this.sun.shadow.bias = -0.0008;
    scene.add(this.sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
      new THREE.MeshStandardMaterial({ color: 0x1b211f, roughness: 0.94 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    this.roadMaterial = new THREE.MeshStandardMaterial({ color: 0x242a31, roughness: 0.78, metalness: 0.05 });
    this.buildingMaterial = new THREE.MeshStandardMaterial({
      color: 0x9aa6ad,
      roughness: 0.7,
      metalness: 0.08,
      map: makeWindowTexture(),
      emissiveMap: makeWindowTexture(),
      emissive: 0x252119,
      emissiveIntensity: 0.22
    });
    this.waterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x163b52,
      roughness: 0.18,
      metalness: 0.28,
      transparent: true,
      opacity: 0.92
    });

    this.createRoads();
    this.createBuildings(physics, quality);
    this.createPark();
    this.createWaterfront();
    this.createElevatedHighway();
    this.createStreetFurniture();
    this.createLandmarks();

    const rainGeometry = new THREE.BufferGeometry();
    this.rainPositions = new Float32Array(900 * 3);
    const random = seededRandom(9942);
    for (let index = 0; index < this.rainPositions.length; index += 3) {
      this.rainPositions[index] = (random() - 0.5) * 120;
      this.rainPositions[index + 1] = random() * 75;
      this.rainPositions[index + 2] = (random() - 0.5) * 120;
    }
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rain = new THREE.Points(
      rainGeometry,
      new THREE.PointsMaterial({ color: 0xb9dcff, size: 0.11, transparent: true, opacity: 0.52 })
    );
    this.rain.visible = false;
    scene.add(this.rain);
  }

  setWeather(weather: Weather, scene: THREE.Scene): void {
    const fog = scene.fog as THREE.FogExp2;
    this.rain.visible = weather === 'rain';
    switch (weather) {
      case 'sunny':
        scene.background = new THREE.Color(0x8fc8eb);
        fog.color.set(0x8fc8eb);
        fog.density = 0.00125;
        this.sun.color.set(0xfff1d1);
        this.sun.intensity = 3.6;
        this.hemisphere.intensity = 2;
        this.buildingMaterial.emissiveIntensity = 0.04;
        this.roadMaterial.roughness = 0.84;
        break;
      case 'sunset':
        scene.background = new THREE.Color(0x3a3549);
        fog.color.set(0x403544);
        fog.density = 0.0016;
        this.sun.color.set(0xffa15c);
        this.sun.intensity = 3.4;
        this.hemisphere.intensity = 1.45;
        this.buildingMaterial.emissiveIntensity = 0.3;
        this.roadMaterial.roughness = 0.78;
        break;
      case 'night':
        scene.background = new THREE.Color(0x070b15);
        fog.color.set(0x070b15);
        fog.density = 0.00215;
        this.sun.color.set(0x8aa4d4);
        this.sun.intensity = 0.55;
        this.hemisphere.intensity = 0.92;
        this.buildingMaterial.emissiveIntensity = 0.8;
        this.roadMaterial.roughness = 0.7;
        break;
      case 'rain':
        scene.background = new THREE.Color(0x253342);
        fog.color.set(0x253342);
        fog.density = 0.00245;
        this.sun.color.set(0xc8d8e6);
        this.sun.intensity = 0.85;
        this.hemisphere.intensity = 1.1;
        this.buildingMaterial.emissiveIntensity = 0.56;
        this.roadMaterial.roughness = 0.3;
        break;
    }
  }

  update(cameraPosition: THREE.Vector3, elapsed: number): void {
    this.sun.position.set(cameraPosition.x - 180, 340, cameraPosition.z - 130);
    this.sun.target.position.set(cameraPosition.x, 0, cameraPosition.z);
    if (!this.rain.visible) return;
    this.rain.position.set(cameraPosition.x, 0, cameraPosition.z);
    for (let index = 1; index < this.rainPositions.length; index += 3) {
      this.rainPositions[index] -= 0.95 + (index % 7) * 0.04;
      if (this.rainPositions[index] < 0) this.rainPositions[index] = 70 + (index % 13);
    }
    (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.waterMaterial.opacity = 0.88 + Math.sin(elapsed * 0.55) * 0.03;
  }

  private createRoads(): void {
    const count = Math.floor(WORLD_SIZE / ROAD_SPACING) + 1;
    const roadGeometry = new THREE.PlaneGeometry(ROAD_WIDTH, WORLD_SIZE);
    const roadCount = (Math.floor(count / 2) * 2 + 1) * 2;
    const roads = new THREE.InstancedMesh(roadGeometry, this.roadMaterial, roadCount);
    const roadMatrix = new THREE.Matrix4();
    const roadRotation = new THREE.Quaternion();
    let roadIndex = 0;
    for (let index = -Math.floor(count / 2); index <= Math.floor(count / 2); index += 1) {
      const coordinate = index * ROAD_SPACING;
      roadRotation.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
      roadMatrix.compose(new THREE.Vector3(coordinate, 0.018, 0), roadRotation, new THREE.Vector3(1, 1, 1));
      roads.setMatrixAt(roadIndex, roadMatrix);
      roadIndex += 1;
      roadRotation.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
      roadMatrix.compose(new THREE.Vector3(0, 0.022, coordinate), roadRotation, new THREE.Vector3(1, 1, 1));
      roads.setMatrixAt(roadIndex, roadMatrix);
      roadIndex += 1;
    }
    roads.receiveShadow = true;
    this.group.add(roads);

    const dashes: Array<{ x: number; z: number; rotation: number }> = [];
    for (let road = -600; road <= 600; road += ROAD_SPACING) {
      for (let step = -690; step <= 690; step += 18) {
        dashes.push({ x: road, z: step, rotation: 0 }, { x: step, z: road, rotation: Math.PI / 2 });
      }
    }
    const dashGeometry = new THREE.PlaneGeometry(0.22, 7);
    const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xd9d2ae, transparent: true, opacity: 0.72 });
    const dashMesh = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashes.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    dashes.forEach((dash, index) => {
      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, dash.rotation));
      matrix.compose(new THREE.Vector3(dash.x, 0.035, dash.z), quaternion, new THREE.Vector3(1, 1, 1));
      dashMesh.setMatrixAt(index, matrix);
    });
    this.group.add(dashMesh);
  }

  private createBuildings(physics: CANNON.World, quality: 'performance' | 'balanced' | 'high'): void {
    const random = seededRandom(198705);
    const buildings: Array<{ x: number; z: number; width: number; depth: number; height: number; rotation: number; blockX: number; blockZ: number }> = [];
    for (let blockX = -5; blockX <= 5; blockX += 1) {
      for (let blockZ = -5; blockZ <= 5; blockZ += 1) {
        if ((blockX === 0 && blockZ === 0) || (blockX >= 4 && blockZ <= -2)) continue;
        const centerX = blockX * ROAD_SPACING + ROAD_SPACING / 2;
        const centerZ = blockZ * ROAD_SPACING + ROAD_SPACING / 2;
        const downtown = 1 - Math.min(1, Math.hypot(centerX, centerZ) / 760);
        const plots = quality === 'performance' ? 2 : 3;
        for (let plot = 0; plot < plots; plot += 1) {
          const width = 18 + random() * 17;
          const depth = 18 + random() * 17;
          const height = 12 + random() * (28 + downtown * 100);
          const angle = (plot / plots) * Math.PI * 2 + random() * 0.4;
          const radius = 15 + random() * 10;
          buildings.push({
            x: centerX + Math.cos(angle) * radius,
            z: centerZ + Math.sin(angle) * radius,
            width,
            depth,
            height,
            rotation: (random() - 0.5) * 0.045,
            blockX: centerX,
            blockZ: centerZ
          });
        }
      }
    }

    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.buildingMaterial, buildings.length);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const compoundBodies = new Map<string, CANNON.Body>();
    buildings.forEach((building, index) => {
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), building.rotation);
      matrix.compose(
        new THREE.Vector3(building.x, building.height / 2, building.z),
        rotation,
        new THREE.Vector3(building.width, building.height, building.depth)
      );
      mesh.setMatrixAt(index, matrix);

      const key = `${building.blockX},${building.blockZ}`;
      let collider = compoundBodies.get(key);
      if (!collider) {
        collider = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(building.blockX, 0, building.blockZ) });
        compoundBodies.set(key, collider);
      }
      const shapeRotation = new CANNON.Quaternion();
      shapeRotation.setFromEuler(0, building.rotation, 0);
      collider.addShape(
        new CANNON.Box(new CANNON.Vec3(building.width / 2, building.height / 2, building.depth / 2)),
        new CANNON.Vec3(building.x - building.blockX, building.height / 2, building.z - building.blockZ),
        shapeRotation
      );
    });
    compoundBodies.forEach((body) => physics.addBody(body));
    this.group.add(mesh);
  }

  private createPark(): void {
    const park = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: 0x274936, roughness: 1 })
    );
    park.rotation.x = -Math.PI / 2;
    park.position.set(60, 0.045, 60);
    this.group.add(park);
    const trunkGeometry = new THREE.CylinderGeometry(0.45, 0.6, 3.8, 7);
    const crownGeometry = new THREE.IcosahedronGeometry(2.6, 1);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x523a27 });
    const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x2c6a48, roughness: 0.9 });
    const treePositions: THREE.Vector3[] = [];
    for (let x = 25; x <= 95; x += 14) {
      for (let z = 25; z <= 95; z += 18) treePositions.push(new THREE.Vector3(x, 0, z));
    }
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treePositions.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, treePositions.length);
    const matrix = new THREE.Matrix4();
    treePositions.forEach((position, index) => {
      matrix.makeTranslation(position.x, 1.9, position.z);
      trunks.setMatrixAt(index, matrix);
      matrix.makeTranslation(position.x, 5.1, position.z);
      crowns.setMatrixAt(index, matrix);
    });
    this.group.add(trunks, crowns);
  }

  private createWaterfront(): void {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(105, 680), this.waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.set(665, 0.08, -130);
    this.group.add(water);
    const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xb7bcc2, roughness: 0.72 });
    const barrierGeometry = new THREE.BoxGeometry(1, 0.8, 9);
    const barrierCount = Math.floor((240 - -480) / 12) + 1;
    const barriers = new THREE.InstancedMesh(barrierGeometry, barrierMaterial, barrierCount);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let z = -480; z <= 240; z += 12) {
      matrix.makeTranslation(610, 0.42, z);
      barriers.setMatrixAt(index, matrix);
      index += 1;
    }
    this.group.add(barriers);
  }

  private createElevatedHighway(): void {
    const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4045, roughness: 0.8 });
    const deckCount = Math.floor((660 - -660) / 24) + 1;
    const pillarCount = Math.floor((648 - -648) / 72) + 1;
    const decks = new THREE.InstancedMesh(new THREE.BoxGeometry(19, 0.8, 24.2), deckMaterial, deckCount);
    const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 1.4, 9.5, 8), deckMaterial, pillarCount);
    const matrix = new THREE.Matrix4();
    let deckIndex = 0;
    let pillarIndex = 0;
    for (let z = -660; z <= 660; z += 24) {
      matrix.makeTranslation(-420, 10, z);
      decks.setMatrixAt(deckIndex, matrix);
      deckIndex += 1;
      if ((deckIndex - 1) % 3 === 0) {
        matrix.makeTranslation(-420, 4.9, z);
        pillars.setMatrixAt(pillarIndex, matrix);
        pillarIndex += 1;
      }
    }
    decks.receiveShadow = true;
    this.group.add(decks, pillars);
  }

  private createStreetFurniture(): void {
    const poleGeometry = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x545c62, metalness: 0.7, roughness: 0.4 });
    const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffe8b5, toneMapped: false });
    const positions: Array<{ pole: THREE.Vector3; lamp: THREE.Vector3 }> = [];
    for (let coordinate = -600; coordinate <= 600; coordinate += 60) {
      if (coordinate % ROAD_SPACING === 0) continue;
      for (const offset of [-16.5, 16.5]) {
        positions.push(
          {
            pole: new THREE.Vector3(coordinate, 3.25, offset),
            lamp: new THREE.Vector3(coordinate, 6.25, offset - Math.sign(offset) * 0.45)
          },
          {
            pole: new THREE.Vector3(offset, 3.25, coordinate),
            lamp: new THREE.Vector3(offset - Math.sign(offset) * 0.45, 6.25, coordinate)
          }
        );
      }
    }
    const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, positions.length);
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.16, 0.3), lampMaterial, positions.length);
    const matrix = new THREE.Matrix4();
    positions.forEach((position, index) => {
      matrix.makeTranslation(position.pole.x, position.pole.y, position.pole.z);
      poles.setMatrixAt(index, matrix);
      matrix.makeTranslation(position.lamp.x, position.lamp.y, position.lamp.z);
      lamps.setMatrixAt(index, matrix);
    });
    this.group.add(poles, lamps);
  }

  private createLandmarks(): void {
    const signs = [
      { x: -55, z: -54, y: 18, label: '新宿 NIGHT', color: '#ff3d7f', rotation: 0 },
      { x: 184, z: 112, y: 15, label: '24 コンビニ', color: '#42e9ff', rotation: Math.PI / 2 },
      { x: 416, z: -305, y: 10, label: '湾岸 AUTO', color: '#f9cf58', rotation: 0 },
      { x: -302, z: 288, y: 17, label: '大阪 RADIO', color: '#a372ff', rotation: Math.PI / 2 }
    ];
    for (const sign of signs) {
      const material = new THREE.MeshBasicMaterial({ map: makeSignTexture(sign.label, sign.color), toneMapped: false });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), material);
      board.position.set(sign.x, sign.y, sign.z);
      board.rotation.y = sign.rotation;
      this.group.add(board);
    }

    const toriiMaterial = new THREE.MeshStandardMaterial({ color: 0xc82b32, roughness: 0.58 });
    for (const x of [34, 86]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), toriiMaterial);
      post.position.set(x, 4.5, 14);
      this.group.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(60, 1.2, 1.6), toriiMaterial);
    beam.position.set(60, 8.5, 14);
    this.group.add(beam);
  }
}
