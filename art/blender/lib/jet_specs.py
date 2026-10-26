"""Data-driven specifications for the five original jets.

All dimensions are metres in Blender space: +Y nose, +Z up, X right wing.
Values are measured against the concept top/side views (see
public/assets/girls/<id>/plane.webp) and are intentionally editable per jet.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from geometry import FinSpec, Station, WingSpec


# --------------------------------------------------------------------------- #
# Shared parts
# --------------------------------------------------------------------------- #

PALETTES = {
    'qingluan': {
        'base': '#e9e5da', 'secondary': '#8ea992', 'accent': '#d8b46a',
        'glow': '#9fe3d0', 'dark': '#1a211e', 'structural': '#39443d',
        'marking': '#efe9d9', 'panel': '#d2ccbe', 'glow_dark': '#12312c',
    },
    'akari': {
        'base': '#f2efe7', 'secondary': '#d23b32', 'accent': '#2b3f66',
        'glow': '#ff6a5a', 'dark': '#15181e', 'structural': '#363d4a',
        'marking': '#f3eee2', 'panel': '#b3ada2', 'glow_dark': '#3a1112',
    },
    'haneul': {
        'base': '#2a3550', 'secondary': '#9aa6b8', 'accent': '#2fb6d9',
        'glow': '#57d8ff', 'dark': '#0e1420', 'structural': '#222c42',
        'marking': '#c9d6e6', 'panel': '#5c6879', 'glow_dark': '#0b2c3a',
    },
    'astra': {
        'base': '#3a3f47', 'secondary': '#2d5ca8', 'accent': '#46c8ff',
        'glow': '#6fe0ff', 'dark': '#14171c', 'structural': '#2a3038',
        'marking': '#c5d0d8', 'panel': '#5d646e', 'glow_dark': '#0c2831',
    },
    'snega': {
        'base': '#e8edf2', 'secondary': '#2d3f5c', 'accent': '#6fd6e8',
        'glow': '#9fefff', 'dark': '#161d26', 'structural': '#354359',
        'marking': '#e6edf5', 'panel': '#9aa3ad', 'glow_dark': '#12303b',
    },
}


@dataclass
class IntakeSpec:
    x: float
    y_lip: float
    z: float
    width: float
    height: float
    length: float
    chamfer: float = 0.24
    inner_scale: float = 0.8
    style: str = 'dsi'  # dsi | caret | box | belly
    dsi_size: tuple[float, float, float] = (0.50, 1.25, 0.70)


@dataclass
class NozzleSpec:
    x: float
    y_exit: float
    z: float
    radius: float
    length: float
    style: str = 'round'  # round | rect | tvc


@dataclass
class CanopySpec:
    y_front: float
    y_back: float
    width: float
    height: float
    base_lift: float = 0.02
    cockpit: bool = True


@dataclass
class GearSpec:
    nose_y: float
    main_x: float
    main_y: float
    nose_strut: float = 0.92
    main_strut: float = 1.02
    nose_wheel: float = 0.30
    main_wheel: float = 0.38
    doors: bool = True


@dataclass
class JetSpec:
    id: str
    name: str
    number: str
    length: float
    span: float
    height: float
    palette: dict
    profile: str
    stations: list[Station]
    wing: WingSpec
    lerx: WingSpec | None = None
    canards: WingSpec | None = None
    levcons: WingSpec | None = None
    fins: list[FinSpec] = field(default_factory=list)
    intakes: list[IntakeSpec] = field(default_factory=list)
    nozzles: list[NozzleSpec] = field(default_factory=list)
    canopy: CanopySpec | None = None
    gear: GearSpec | None = None
    details: dict = field(default_factory=dict)
    dorsal_spine: bool = True
    livery: str = ''

    @property
    def half_span(self) -> float:
        return self.span * 0.5


# --------------------------------------------------------------------------- #
# Fuselage station generation
# --------------------------------------------------------------------------- #

_Y_CTRL = [-0.500, -0.470, -0.420, -0.355, -0.275, -0.180, -0.075, 0.030,
           0.130, 0.225, 0.310, 0.385, 0.445, 0.485, 0.500]
_W_CTRL = [0.070, 0.180, 0.400, 0.640, 0.830, 0.945, 0.995, 1.000,
           0.985, 0.940, 0.865, 0.745, 0.570, 0.320, 0.050]
_T_CTRL = [0.120, 0.220, 0.430, 0.640, 0.800, 0.900, 0.965, 0.990,
           1.000, 0.980, 0.930, 0.850, 0.700, 0.450, 0.060]
_B_CTRL = [0.140, 0.250, 0.460, 0.660, 0.820, 0.925, 0.975, 0.995,
           0.985, 0.950, 0.895, 0.800, 0.650, 0.430, 0.070]


def _lerp_series(xs: list[float], ys: list[float], x: float) -> float:
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    for i in range(len(xs) - 1):
        if xs[i] <= x <= xs[i + 1]:
            t = (x - xs[i]) / (xs[i + 1] - xs[i]) if xs[i + 1] != xs[i] else 0.0
            return ys[i] + (ys[i + 1] - ys[i]) * t
    return ys[-1]


def make_stations(length: float, half_width: float, top: float, bottom: float,
                  z_curve: list[float] | None = None, count: int = 30,
                  width_scale: float = 1.0,
                  nose_sharpness: float = 1.0,
                  tail_lift: float = 0.0,
                  width_ctrl: list[float] | None = None,
                  top_ctrl: list[float] | None = None,
                  bottom_ctrl: list[float] | None = None) -> list[Station]:
    """Cone-ish fighter fuselage with a sharp nose and a boat-tail rear."""
    w_ctrl = width_ctrl if width_ctrl is not None else _W_CTRL
    t_ctrl = top_ctrl if top_ctrl is not None else _T_CTRL
    b_ctrl = bottom_ctrl if bottom_ctrl is not None else _B_CTRL
    stations: list[Station] = []
    for i in range(count):
        u = 0.5 - 0.5 * math.cos(math.pi * i / (count - 1))
        yn = -0.5 + u
        w = _lerp_series(_Y_CTRL, w_ctrl, yn)
        t = _lerp_series(_Y_CTRL, t_ctrl, yn)
        b = _lerp_series(_Y_CTRL, b_ctrl, yn)
        # Sharpen the forward section: shrink width/top towards the nose.
        if yn > 0.30:
            k = (yn - 0.30) / 0.20
            w *= (1.0 - 0.20 * k * nose_sharpness)
            t *= (1.0 - 0.12 * k * nose_sharpness)
            b *= (1.0 - 0.12 * k * nose_sharpness)
        z = 0.0
        if z_curve:
            z = _lerp_series(_Y_CTRL, z_curve, yn)
        # Raise the tail boom a little for a boat-tail silhouette.
        if yn < -0.20 and tail_lift:
            k = (-0.20 - yn) / 0.30
            z += tail_lift * min(1.0, k)
        stations.append(Station(
            y=yn * length,
            width=w * half_width * width_scale,
            top=t * top,
            bottom=b * bottom,
            z=z,
        ))
    return stations


def fuse_top_at(stations: list[Station], y: float) -> float:
    from geometry import station_at
    st = station_at(stations, y)
    return st.z + st.top


# --------------------------------------------------------------------------- #
# Jet definitions
# --------------------------------------------------------------------------- #

def _qingluan() -> JetSpec:
    length, span = 21.8, 15.2
    stations = make_stations(
        length, half_width=1.72, top=0.68, bottom=0.62,
        z_curve=[0.09, 0.10, 0.08, 0.055, 0.025, 0.0, 0.0, 0.0,
                 0.0, -0.005, -0.012, -0.025, -0.045, -0.07, -0.10],
        count=48, nose_sharpness=1.35, tail_lift=0.10,
        width_ctrl=[0.50, 0.58, 0.72, 0.86, 0.95, 1.0, 1.0, 0.995,
                    0.97, 0.91, 0.82, 0.68, 0.50, 0.30, 0.06],
        top_ctrl=[0.30, 0.38, 0.55, 0.70, 0.83, 0.91, 0.96, 0.985,
                  0.995, 0.975, 0.93, 0.85, 0.70, 0.46, 0.07],
        bottom_ctrl=[0.32, 0.42, 0.60, 0.75, 0.86, 0.93, 0.97, 0.99,
                     0.985, 0.96, 0.91, 0.83, 0.68, 0.46, 0.07],
    )
    wing = WingSpec(
        root_x=0.90, tip_x=span * 0.5,
        root_le=5.8, root_te=-6.2,
        tip_le=-3.9, tip_te=-8.15,
        curve=[
            (0.90, 5.80, -6.20),
            (1.80, 4.40, -6.35),
            (3.00, 2.70, -6.55),
            (4.20, 0.90, -6.80),
            (5.60, -1.20, -7.20),
            (6.70, -2.80, -7.70),
            (7.60, -3.90, -8.15),
        ],
        z_root=-0.12, dihedral=math.radians(2.4),
        thickness_root=0.80, thickness_tip=0.16,
        segments_span=66, segments_chord=60,
    )
    canards = WingSpec(
        root_x=1.00, tip_x=3.70,
        root_le=7.00, root_te=5.50,
        tip_le=5.90, tip_te=5.55,
        z_root=0.26, dihedral=math.radians(5.0),
        thickness_root=0.18, thickness_tip=0.05,
        segments_span=14, segments_chord=18,
    )
    fins = [FinSpec(
        offset=1.85, root_z=0.16, height=3.00,
        root_le=-5.8, root_te=-8.9,
        tip_le=-8.1, tip_te=-9.60,
        cant=math.radians(24.0),
        thickness_root=0.18, thickness_tip=0.055,
        segments_span=22, segments_chord=28,
    )]
    intakes = [IntakeSpec(
        x=1.72, y_lip=4.65, z=-0.22, width=0.92, height=0.90, length=5.0,
        chamfer=0.20, inner_scale=0.78, style='dsi', dsi_size=(0.14, 0.50, 0.24),
    )]
    nozzles = [NozzleSpec(x=0.82, y_exit=-11.20, z=-0.12, radius=0.60,
                          length=2.2, style='round')]
    canopy = CanopySpec(y_front=5.45, y_back=0.95, width=0.60, height=0.34, base_lift=0.05)
    gear = GearSpec(nose_y=4.10, main_x=1.70, main_y=-2.70,
                    nose_wheel=0.33, main_wheel=0.44)
    return JetSpec(
        id='qingluan', name='QINGLUAN', number='QL-01',
        length=length, span=span, height=4.6,
        palette=PALETTES['qingluan'], profile='faceted', stations=stations,
        wing=wing, canards=canards, fins=fins,
        intakes=intakes, nozzles=nozzles, canopy=canopy, gear=gear,
        details=dict(irst=True, pitot=True, refuel=True, serrated=False,
                     ew_strips=False, sensor_windows=True, aux_intakes=True,
                     dorsal_antenna=True, nav_lights=True, panel_density='rich'),
        dorsal_spine=True, livery='qingluan',
    )


def _akari() -> JetSpec:
    length, span = 18.2, 12.6
    stations = make_stations(length, half_width=1.32, top=0.80, bottom=0.76,
                             z_curve=[0.04, 0.05, 0.04, 0.025, 0.01, 0.0, 0.0, 0.0,
                                      0.0, -0.005, -0.012, -0.02, -0.035, -0.05, -0.07],
                             count=38, nose_sharpness=0.95, tail_lift=0.07)
    wing = WingSpec(
        root_x=0.95, tip_x=span * 0.5,
        root_le=3.9, root_te=-4.6,
        tip_le=-3.0, tip_te=-6.05,
        curve=[
            (0.95, 3.90, -4.60),
            (1.70, 2.80, -4.75),
            (2.70, 1.50, -4.95),
            (3.80, 0.20, -5.20),
            (4.90, -1.10, -5.50),
            (5.70, -2.20, -5.80),
            (6.30, -3.00, -6.05),
        ],
        z_root=-0.10, dihedral=math.radians(2.6),
        thickness_root=0.50, thickness_tip=0.12,
        segments_span=84, segments_chord=74,
    )
    fins = [FinSpec(
        offset=0.0, root_z=0.12, height=2.70,
        root_le=-4.9, root_te=-7.8,
        tip_le=-6.8, tip_te=-8.2,
        cant=0.0, thickness_root=0.18, thickness_tip=0.05,
        segments_span=18, segments_chord=24,
    )]
    intakes = [IntakeSpec(
        x=0.0, y_lip=2.60, z=-0.55, width=1.25, height=0.62, length=3.60,
        chamfer=0.12, inner_scale=0.80, style='belly',
    )]
    nozzles = [NozzleSpec(x=0.0, y_exit=-8.95, z=0.0, radius=0.82,
                          length=2.4, style='round')]
    canopy = CanopySpec(y_front=4.90, y_back=1.50, width=0.72, height=0.36, base_lift=0.05)
    gear = GearSpec(nose_y=4.20, main_x=1.35, main_y=-1.85,
                    nose_wheel=0.30, main_wheel=0.40)
    return JetSpec(
        id='akari', name='AKARI-02', number='02',
        length=length, span=span, height=4.8,
        palette=PALETTES['akari'], profile='round', stations=stations,
        wing=wing, fins=fins, intakes=intakes, nozzles=nozzles,
        canopy=canopy, gear=gear,
        details=dict(irst=False, pitot=True, refuel=True, serrated=False,
                     ew_strips=False, sensor_windows=True, aux_intakes=False,
                     dorsal_antenna=True, nav_lights=True, panel_density='medium'),
        dorsal_spine=True, livery='akari',
    )


def _haneul() -> JetSpec:
    length, span = 21.3, 15.2
    stations = make_stations(
        length, half_width=1.50, top=0.72, bottom=0.66,
        z_curve=[0.06, 0.07, 0.06, 0.04, 0.02, 0.0, 0.0, 0.0,
                 0.0, -0.005, -0.012, -0.025, -0.045, -0.07, -0.09],
        count=46, nose_sharpness=1.15, tail_lift=0.09,
        width_ctrl=[0.48, 0.56, 0.70, 0.84, 0.94, 1.0, 1.0, 0.995,
                    0.97, 0.91, 0.82, 0.68, 0.50, 0.30, 0.06],
    )
    wing = WingSpec(
        root_x=0.95, tip_x=span * 0.5,
        root_le=5.5, root_te=-6.1,
        tip_le=-3.85, tip_te=-8.0,
        curve=[
            (0.95, 5.50, -6.10),
            (1.90, 4.10, -6.20),
            (3.20, 2.30, -6.45),
            (4.50, 0.55, -6.75),
            (5.80, -1.25, -7.15),
            (6.80, -2.75, -7.60),
            (7.60, -3.85, -8.00),
        ],
        z_root=-0.12, dihedral=math.radians(2.4),
        thickness_root=0.72, thickness_tip=0.15,
        segments_span=80, segments_chord=70,
    )
    fins = [FinSpec(
        offset=1.85, root_z=0.12, height=3.50,
        root_le=-5.6, root_te=-8.9,
        tip_le=-8.0, tip_te=-9.6,
        cant=math.radians(24.0),
        thickness_root=0.18, thickness_tip=0.06,
        segments_span=22, segments_chord=28,
    )]
    intakes = [IntakeSpec(
        x=1.75, y_lip=4.30, z=-0.24, width=0.88, height=0.90, length=4.90,
        chamfer=0.10, inner_scale=0.78, style='caret',
    )]
    nozzles = [NozzleSpec(x=0.82, y_exit=-10.95, z=-0.10, radius=0.60,
                          length=2.3, style='round')]
    canopy = CanopySpec(y_front=5.40, y_back=1.00, width=0.68, height=0.36, base_lift=0.05)
    gear = GearSpec(nose_y=4.20, main_x=1.70, main_y=-2.60,
                    nose_wheel=0.31, main_wheel=0.41)
    return JetSpec(
        id='haneul', name='HANEUL-21', number='21',
        length=length, span=span, height=5.8,
        palette=PALETTES['haneul'], profile='faceted', stations=stations,
        wing=wing, fins=fins, intakes=intakes, nozzles=nozzles,
        canopy=canopy, gear=gear,
        details=dict(irst=True, pitot=True, refuel=True, serrated=False,
                     ew_strips=True, sensor_windows=True, aux_intakes=True,
                     dorsal_antenna=True, nav_lights=True, panel_density='rich'),
        dorsal_spine=True, livery='haneul',
    )


def _astra() -> JetSpec:
    length, span = 15.7, 11.0
    stations = make_stations(
        length, half_width=1.30, top=0.66, bottom=0.60,
        z_curve=[0.05, 0.06, 0.05, 0.035, 0.015, 0.0, 0.0, 0.0,
                 0.0, -0.005, -0.012, -0.02, -0.035, -0.05, -0.07],
        count=42, nose_sharpness=1.05, tail_lift=0.06,
        width_ctrl=[0.46, 0.54, 0.68, 0.82, 0.93, 1.0, 1.0, 0.995,
                    0.97, 0.90, 0.80, 0.66, 0.48, 0.28, 0.06],
    )
    wing = WingSpec(
        root_x=0.90, tip_x=span * 0.5,
        root_le=4.4, root_te=-4.5,
        tip_le=-2.6, tip_te=-5.8,
        curve=[
            (0.90, 4.40, -4.50),
            (1.70, 3.30, -4.60),
            (2.60, 1.90, -4.80),
            (3.50, 0.50, -5.05),
            (4.40, -0.90, -5.35),
            (5.00, -1.90, -5.60),
            (5.50, -2.60, -5.80),
        ],
        z_root=-0.10, dihedral=math.radians(2.2),
        thickness_root=0.62, thickness_tip=0.14,
        segments_span=82, segments_chord=74,
    )
    fins = [FinSpec(
        offset=1.30, root_z=0.12, height=2.60,
        root_le=-4.3, root_te=-6.7,
        tip_le=-5.9, tip_te=-7.15,
        cant=math.radians(22.0),
        thickness_root=0.16, thickness_tip=0.05,
        segments_span=18, segments_chord=24,
    )]
    intakes = [IntakeSpec(
        x=1.40, y_lip=3.70, z=-0.22, width=0.72, height=0.78, length=3.80,
        chamfer=0.28, inner_scale=0.79, style='dsi', dsi_size=(0.12, 0.45, 0.22),
    )]
    nozzles = [NozzleSpec(x=0.0, y_exit=-8.00, z=0.0, radius=0.82,
                          length=2.3, style='round')]
    canopy = CanopySpec(y_front=4.20, y_back=0.80, width=0.66, height=0.33, base_lift=0.05)
    gear = GearSpec(nose_y=3.20, main_x=1.35, main_y=-1.70,
                    nose_wheel=0.28, main_wheel=0.37)
    return JetSpec(
        id='astra', name='ASTRA-35', number='35',
        length=length, span=span, height=4.38,
        palette=PALETTES['astra'], profile='faceted', stations=stations,
        wing=wing, fins=fins, intakes=intakes, nozzles=nozzles,
        canopy=canopy, gear=gear,
        details=dict(irst=False, pitot=True, refuel=True, serrated=True,
                     ew_strips=False, sensor_windows=True, aux_intakes=True,
                     dorsal_antenna=True, nav_lights=True, panel_density='rich',
                     eots=True),
        dorsal_spine=True, livery='astra',
    )


def _snega() -> JetSpec:
    length, span = 22.8, 16.4
    stations = make_stations(
        length, half_width=1.70, top=0.76, bottom=0.70,
        z_curve=[0.07, 0.08, 0.07, 0.05, 0.025, 0.0, 0.0, 0.0,
                 0.0, -0.005, -0.012, -0.025, -0.045, -0.07, -0.10],
        count=48, width_scale=1.10, nose_sharpness=1.0, tail_lift=0.10,
        width_ctrl=[0.52, 0.60, 0.74, 0.86, 0.95, 1.0, 1.0, 0.995,
                    0.97, 0.91, 0.82, 0.68, 0.50, 0.30, 0.06],
    )
    wing = WingSpec(
        root_x=1.00, tip_x=span * 0.5,
        root_le=5.8, root_te=-6.5,
        tip_le=-3.9, tip_te=-8.6,
        curve=[
            (1.00, 5.80, -6.50),
            (2.10, 4.50, -6.60),
            (3.50, 2.90, -6.80),
            (5.00, 1.00, -7.20),
            (6.40, -1.00, -7.70),
            (7.50, -2.70, -8.20),
            (8.20, -3.90, -8.60),
        ],
        z_root=-0.12, dihedral=math.radians(1.8),
        thickness_root=0.85, thickness_tip=0.17,
        segments_span=84, segments_chord=74,
    )
    levcons = WingSpec(
        root_x=1.00, tip_x=3.00,
        root_le=7.00, root_te=5.00,
        tip_le=6.00, tip_te=5.20,
        z_root=0.24, dihedral=math.radians(4.0),
        thickness_root=0.20, thickness_tip=0.06,
        segments_span=10, segments_chord=14,
    )
    fins = [FinSpec(
        offset=2.00, root_z=0.15, height=3.20,
        root_le=-5.6, root_te=-8.8,
        tip_le=-7.9, tip_te=-9.50,
        cant=math.radians(24.0),
        thickness_root=0.20, thickness_tip=0.06,
        segments_span=22, segments_chord=28,
    )]
    intakes = [IntakeSpec(
        x=1.85, y_lip=4.50, z=-0.26, width=0.95, height=0.98, length=5.20,
        chamfer=0.14, inner_scale=0.78, style='caret',
    )]
    nozzles = [NozzleSpec(x=1.00, y_exit=-11.20, z=-0.10, radius=0.68,
                          length=2.6, style='tvc')]
    canopy = CanopySpec(y_front=5.50, y_back=1.00, width=0.74, height=0.38, base_lift=0.05)
    gear = GearSpec(nose_y=4.50, main_x=1.80, main_y=-2.80,
                    nose_wheel=0.32, main_wheel=0.44)
    return JetSpec(
        id='snega', name='SNEGA-57', number='57',
        length=length, span=span, height=5.1,
        palette=PALETTES['snega'], profile='wide', stations=stations,
        wing=wing, levcons=levcons, fins=fins, intakes=intakes,
        nozzles=nozzles, canopy=canopy, gear=gear,
        details=dict(irst=True, pitot=True, refuel=True, serrated=False,
                     ew_strips=False, sensor_windows=True, aux_intakes=True,
                     dorsal_antenna=True, nav_lights=True, panel_density='rich'),
        dorsal_spine=True, livery='snega',
    )


JETS: dict[str, JetSpec] = {}

for _factory in (_qingluan, _akari, _haneul, _astra, _snega):
    _spec = _factory()
    JETS[_spec.id] = _spec


JET_ORDER = ['qingluan', 'akari', 'haneul', 'astra', 'snega']
