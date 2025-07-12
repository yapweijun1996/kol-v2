// --- IndexedDB Setup ---
const DB_NAME = 'kol_management_db';
const DB_VERSION = 7; // Incremented version for gender
const STORE_NAME = 'kols';
        const STORES = {
            kols: 'kols',
            countries: 'countries',
            genders: 'genders',
            ageRanges: 'age_ranges',
            packages: 'packages',
            platforms: 'platforms'
        };
        let db;

        document.addEventListener('DOMContentLoaded', () => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                db = event.target.result;
                if (!db.objectStoreNames.contains(STORES.kols)) {
                    db.createObjectStore(STORES.kols, { keyPath: 'id', autoIncrement: true });
                }
                if (event.oldVersion < 4) {
                    if (!db.objectStoreNames.contains(STORES.countries)) {
                        db.createObjectStore(STORES.countries, { keyPath: 'id', autoIncrement: true });
                    }
                    if (!db.objectStoreNames.contains(STORES.ageRanges)) {
                        db.createObjectStore(STORES.ageRanges, { keyPath: 'id', autoIncrement: true });
                    }
                    if (!db.objectStoreNames.contains(STORES.packages)) {
                        db.createObjectStore(STORES.packages, { keyPath: 'id', autoIncrement: true });
                    }
                }

                // Migration logic for version 2 (already existed)
                if (event.oldVersion < 2) {
                    const transaction = event.currentTarget.transaction;
                    const objectStore = transaction.objectStore(STORE_NAME);
                    objectStore.openCursor().onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const kol = cursor.value;
                            if (!kol.countries) {
                                kol.countries = []; // Add the new 'countries' property
                                cursor.update(kol);
                            }
                            cursor.continue();
                        }
                    };
                }

                // Migration logic for version 3: Move countries from KOL to first platform
                if (event.oldVersion < 3) {
                    const transaction = event.currentTarget.transaction;
                    const objectStore = transaction.objectStore(STORE_NAME);
                    objectStore.openCursor().onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const kol = cursor.value;
                            if (kol.countries && kol.countries.length > 0) {
                                if (kol.platforms && kol.platforms.length > 0) {
                                    // Move countries to the first platform
                                    if (!kol.platforms[0].countries) {
                                        kol.platforms[0].countries = [];
                                    }
                                    kol.platforms[0].countries = [...kol.platforms[0].countries, ...kol.countries];
                                }
                                kol.countries = []; // Clear countries from KOL level
                            }
                            // Ensure all platforms have a countries array
                            kol.platforms.forEach(platform => {
                                if (!platform.countries) {
                                    platform.countries = [];
                                }
                            });
                            cursor.update(kol);
                            cursor.continue();
                        }
                    };
                }
                 // Migration logic for version 5: Add ageRanges and packages to platforms
                 if (event.oldVersion < 5) {
                    const transaction = event.currentTarget.transaction;
                    const objectStore = transaction.objectStore(STORE_NAME);
                    objectStore.openCursor().onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const kol = cursor.value;
                            if (kol.platforms) {
                                kol.platforms.forEach(platform => {
                                    if (!platform.ageRanges) {
                                        platform.ageRanges = [];
                                    }
                                    if (!platform.packages) {
                                        platform.packages = [];
                                    }
                                });
                            }
                            cursor.update(kol);
                            cursor.continue();
                        }
                    };
                }

                // Migration for version 6: Add platforms general code store
                if (event.oldVersion < 6) {
                    if (!db.objectStoreNames.contains(STORES.platforms)) {
                        const platformStore = db.createObjectStore(STORES.platforms, { keyPath: 'id', autoIncrement: true });
                        // Add initial platform data
                        platformStore.transaction.oncomplete = (event) => {
                            const platformObjectStore = db.transaction(STORES.platforms, 'readwrite').objectStore(STORES.platforms);
                            const initialPlatforms = [
                                { code: 'TT', desc: 'TikTok' },
                                { code: 'IG', desc: 'Instagram' },
                                { code: 'YT', desc: 'YouTube' },
                                { code: 'TW', desc: 'Twitter' },
                                { code: 'TTV', desc: 'Twitch' }
                            ];
                            initialPlatforms.forEach(platform => {
                                platformObjectStore.add(platform);
                            });
                        };
                    }
                }
                 // Migration for version 7: Add genders store
                 if (event.oldVersion < 7) {
                    if (!db.objectStoreNames.contains(STORES.genders)) {
                        db.createObjectStore(STORES.genders, { keyPath: 'id', autoIncrement: true });
                    }
                }

                // Migration for version 8: Add genders to platforms
                if (event.oldVersion < 8) {
                    const transaction = event.currentTarget.transaction;
                    const objectStore = transaction.objectStore(STORE_NAME);
                    objectStore.openCursor().onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const kol = cursor.value;
                            if (kol.platforms) {
                                kol.platforms.forEach(platform => {
                                    if (!platform.genders) {
                                        platform.genders = [];
                                    }
                                });
                            }
                            cursor.update(kol);
                            cursor.continue();
                        }
                    };
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log('IndexedDB opened successfully');
                loadKOLsFromDB(); // Load data once DB is ready
            };

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.errorCode);
            };

            // --- DATA ---
            let kols = []; // Initialize as empty, data will be loaded from DB
            let nextId = 1; // Will be updated by loaded data or incremented
            let nextPlatformId = 1; // Will be updated by loaded data or incremented
            let nextCountryId = 1; // New: For country data IDs
            let currentPlatformId = null; // New: To track the platform being edited

            // --- STATE ---
            let currentKOLId = null;
            let currentTab = 'platforms'; // New: To track active tab - will remain 'platforms' always for this view

            // --- DOM ELEMENTS ---
            const kolListBody = document.getElementById('kol-list');
            const sections = {
                view: document.getElementById('view-kols-section'),
                add: document.getElementById('add-kol-section'),
                detail: document.getElementById('kol-detail-section'),
                settings: document.getElementById('settings-section'),
                generalCode: document.getElementById('general-code-section'),
                report: document.getElementById('report-section'),
                kolPackageQuotationReport: document.getElementById('kol-package-quotation-report-section')
            };
            const navLinks = {
                view: document.getElementById('nav-view-kols'),
                settings: document.getElementById('nav-settings'),
                generalCode: document.getElementById('nav-general-code'),
                kolFollowersReport: document.getElementById('nav-kol-followers-report'),
                kolPackageQuotationReport: document.getElementById('nav-kol-package-quotation-report')
            };

            // Detail View Elements
            const kolDetailName = document.getElementById('kol-detail-name');
            const kolPlatformsList = document.getElementById('kol-platforms-list');
            const backToListBtn = document.getElementById('back-to-list-btn');
            const addPlatformBtn = document.getElementById('add-platform-btn');

            // Removed tabLinks and tabContents as they are no longer needed for separate tabs
            // const tabLinks = document.querySelectorAll('.tab-link'); 
            // const tabContents = { 
            //     platforms: document.getElementById('platforms-tab-content'),
            //     countries: document.getElementById('countries-tab-content')
            // };

            // Form Elements
            const addKolForm = document.getElementById('add-kol-form');
            const cancelAddKolBtn = document.getElementById('cancel-add-kol');
            const addKolBtnFromView = document.getElementById('add-kol-btn-from-view');

            // Modal Elements
            const addPlatformModal = document.getElementById('add-platform-modal');
            const addPlatformForm = document.getElementById('add-platform-form');
            const modalCloseBtnPlatform = addPlatformModal.querySelector('.modal-close-btn');
            const modalOverlayPlatform = document.getElementById('add-platform-modal');

            const editPlatformModal = document.getElementById('edit-platform-modal');
            const editPlatformForm = document.getElementById('edit-platform-form');
            const modalCloseBtnEditPlatform = editPlatformModal.querySelector('.modal-close-btn');
            const modalOverlayEditPlatform = document.getElementById('edit-platform-modal');

            const addCountryModal = document.getElementById('add-country-modal'); 
            const addCountryForm = document.getElementById('add-country-form'); 
            const modalCloseBtnCountry = addCountryModal.querySelector('.modal-close-btn'); 
            const modalOverlayCountry = document.getElementById('add-country-modal'); 
            const addCountryRowBtn = document.getElementById('add-country-row-btn'); 
            const countryRowsContainer = document.getElementById('country-rows-container');

            // Manage Details Modal Elements
            const manageDetailsModal = document.getElementById('manage-details-modal');
            const manageDetailsForm = document.getElementById('manage-details-form');
            const cancelManageDetailsBtn = document.getElementById('cancel-manage-details');
            const manageDetailsCloseBtn = manageDetailsModal.querySelector('.modal-close-btn');
            const countriesManagementContainer = document.getElementById('countries-management-container');
            const gendersManagementContainer = document.getElementById('genders-management-container');
            const ageRangesManagementContainer = document.getElementById('age-ranges-management-container');
            const packagesManagementContainer = document.getElementById('packages-management-container');
            const addManagedCountryRowBtn = document.getElementById('add-managed-country-row-btn');
            const addManagedGenderRowBtn = document.getElementById('add-managed-gender-row-btn');
            const addManagedAgeRangeRowBtn = document.getElementById('add-managed-age-range-row-btn');

            // General Code Elements
            const generalCodeModal = document.getElementById('general-code-modal');
            const generalCodeModalTitle = document.getElementById('general-code-modal-title');
            const generalCodeForm = document.getElementById('general-code-form');
            const generalCodeIdInput = document.getElementById('general-code-id');
            const generalCodeCodeInput = document.getElementById('general-code-code');
            const generalCodeDescInput = document.getElementById('general-code-desc');
            const generalCodeCloseBtn = generalCodeModal.querySelector('.modal-close-btn');

            const countriesList = document.getElementById('countries-list');
            const gendersList = document.getElementById('genders-list');
            const ageRangesList = document.getElementById('age-ranges-list');
            const packagesList = document.getElementById('packages-list');
            const platformsList = document.getElementById('platforms-list');

            const addCountryBtn = document.getElementById('add-country-btn');
            const addGenderBtn = document.getElementById('add-gender-btn');
            const addAgeRangeBtn = document.getElementById('add-age-range-btn');
            const addPackageBtn = document.getElementById('add-package-btn');
            const addPlatformBtnGeneral = document.getElementById('add-platform-btn-general');

            let currentGeneralCodeStore = '';

            // --- FUNCTIONS ---
            const saveKOLsToDB = () => {
                if (!db) {
                    console.error('IndexedDB not ready.');
                    return;
                }
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const objectStore = transaction.objectStore(STORE_NAME);
                objectStore.clear(); // Clear existing data

                kols.forEach(kol => {
                    objectStore.put(kol);
                });

                transaction.oncomplete = () => {
                    console.log('KOLs saved to IndexedDB.');
                };

                transaction.onerror = (event) => {
                    console.error('Error saving KOLs to IndexedDB:', event.target.error);
                };
            };

            const loadKOLsFromDB = () => {
                if (!db) {
                    console.error('IndexedDB not ready.');
                    return;
                }
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const objectStore = transaction.objectStore(STORE_NAME);
                const request = objectStore.getAll();

                request.onsuccess = (event) => {
                    const loadedKOLs = event.target.result;
                    if (loadedKOLs.length > 0) {
                        kols = loadedKOLs;
                        // Find the maximum existing ID and set nextId
                        nextId = Math.max(...kols.map(kol => kol.id)) + 1;
                        // Find the maximum existing platform ID and set nextPlatformId
                        const allPlatformIds = kols.flatMap(kol => kol.platforms.map(p => parseInt(p.id.substring(1), 10)));
                        if (allPlatformIds.length > 0) {
                            nextPlatformId = Math.max(...allPlatformIds) + 1;
                        } else {
                            nextPlatformId = 1;
                        }
                        // Find the maximum existing country ID and set nextCountryId
                        const allCountryIds = kols.flatMap(kol => kol.countries ? kol.countries.map(c => parseInt(c.id.substring(1), 10)) : []);
                        if (allCountryIds.length > 0) {
                            nextCountryId = Math.max(...allCountryIds) + 1;
                        } else {
                            nextCountryId = 1;
                        }
                    } else {
                        // If no data in DB, use initial dummy data
                        kols = [
                            {
                                id: 1,
                                name: 'Alice Johnson',
                                platforms: [
                                    {
                                        platformName: 'TikTok', handle: '@alicej_tok', followers: 120000, id: 'p1',
                                        countries: [
                                            { countryCode: 'SG', percentage: 70, exactNumber: 84000, id: 'c1' },
                                            { countryCode: 'MY', percentage: 20, exactNumber: 24000, id: 'c2' }
                                        ],
                                        genders: [],
                                        ageRanges: [],
                                        packages: []
                                    },
                                    {
                                        platformName: 'Instagram', handle: '@alice.j', followers: 30000, id: 'p2',
                                        countries: [],
                                        genders: [],
                                        ageRanges: [],
                                        packages: []
                                    }
                                ]
                            },
                            {
                                id: 2,
                                name: 'Bob Williams',
                                platforms: [
                                    {
                                        platformName: 'YouTube', handle: 'BobWillVideos', followers: 75000, id: 'p3',
                                        countries: [
                                            { countryCode: 'SG', percentage: 50, exactNumber: 37500, id: 'c3' }
                                        ],
                                        genders: [],
                                        ageRanges: [],
                                        packages: []
                                    }
                                ]
                            },
                            {
                                id: 3,
                                name: 'Charlie Brown',
                                platforms: [
                                    {
                                        platformName: 'Twitter', handle: '@charlieb', followers: 180000, id: 'p4',
                                        countries: [],
                                        genders: [],
                                        ageRanges: [],
                                        packages: []
                                    },
                                    {
                                        platformName: 'Twitch', handle: 'charliebgaming', followers: 40000, id: 'p5',
                                        countries: [
                                            { countryCode: 'MY', percentage: 80, exactNumber: 32000, id: 'c4' }
                                        ],
                                        genders: [],
                                        ageRanges: [],
                                        packages: []
                                    }
                                ]
                            }
                        ];
                        nextId = 4;
                        nextPlatformId = 6;
                        nextCountryId = 5; // Updated to reflect new dummy data
                        saveKOLsToDB(); // Save dummy data to DB
                    }
                    renderKOLs();
                    showView('view');
                };

                request.onerror = (event) => {
                    console.error('Error loading KOLs from IndexedDB:', event.target.error);
                    // Fallback to initial dummy data if loading fails
                    kols = [
                        {
                            id: 1,
                            name: 'Alice Johnson',
                            platforms: [
                                {
                                    platformName: 'TikTok', handle: '@alicej_tok', followers: 120000, id: 'p1',
                                    countries: [
                                        { countryCode: 'SG', percentage: 70, exactNumber: 84000, id: 'c1' },
                                        { countryCode: 'MY', percentage: 20, exactNumber: 24000, id: 'c2' }
                                    ]
                                },
                                {
                                    platformName: 'Instagram', handle: '@alice.j', followers: 30000, id: 'p2',
                                    countries: []
                                }
                            ]
                        },
                        {
                            id: 2,
                            name: 'Bob Williams',
                            platforms: [
                                {
                                    platformName: 'YouTube', handle: 'BobWillVideos', followers: 75000, id: 'p3',
                                    countries: [
                                        { countryCode: 'SG', percentage: 50, exactNumber: 37500, id: 'c3' }
                                    ]
                                }
                            ]
                        },
                        {
                            id: 3,
                            name: 'Charlie Brown',
                            platforms: [
                                {
                                    platformName: 'Twitter', handle: '@charlieb', followers: 180000, id: 'p4',
                                    countries: []
                                },
                                {
                                    platformName: 'Twitch', handle: 'charliebgaming', followers: 40000, id: 'p5',
                                    countries: [
                                        { countryCode: 'MY', percentage: 80, exactNumber: 32000, id: 'c4' }
                                    ]
                                }
                            ]
                        }
                    ];
                    nextId = 4;
                    nextPlatformId = 6;
                    nextCountryId = 5;
                    renderKOLs();
                    showView('view');
                };
            };
            
            // --- FUNCTIONS ---
            const renderKOLs = () => {
                kolListBody.innerHTML = '';
                kols.forEach(kol => {
                    const totalFollowers = kol.platforms.reduce((sum, platform) => sum + platform.followers, 0);
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><a href="#" class="kol-name-link" data-id="${kol.id}">${kol.name}</a></td>
                        <td>${kol.platforms.map(p => p.platformName).join(', ')}</td>
                        <td>${totalFollowers.toLocaleString()}</td>
                        <td>
                            <button class="btn-danger" data-id="${kol.id}">Delete</button>
                        </td>
                    `;
                    kolListBody.appendChild(row);
                });
            };

            const renderPlatforms = (kolId) => {
                const kol = kols.find(k => k.id === kolId);
                if (!kol) return;
                
                kolPlatformsList.innerHTML = '';
                kol.platforms.forEach(platform => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${platform.platformName}</td>
                        <td>${platform.handle}</td>
                        <td>${platform.followers.toLocaleString()}</td>
                        <td>
                            <button class="btn-edit btn-edit-platform" data-platform-id="${platform.id}">Edit</button>
                            <button class="btn-edit btn-manage-details" data-platform-id="${platform.id}">Manage Details</button>
                            <button class="btn-danger btn-delete-platform" data-id="${platform.id}">Delete</button>
                        </td>
                    `;
                    kolPlatformsList.appendChild(row);
                });
            };

            // This function is now for rendering countries within the modal for a specific platform
            const renderCountriesInModal = (platform) => {
                countryRowsContainer.innerHTML = ''; // Clear previous rows
                (platform.countries || []).forEach(country => {
                    addCountryRow(country);
                });
            };

            const showView = (viewId) => {
                Object.values(sections).forEach(section => section.classList.add('hidden'));
                if (sections[viewId]) {
                    sections[viewId].classList.remove('hidden');
                }

                Object.values(navLinks).forEach(link => link.classList.remove('active'));
                if (navLinks[viewId]) {
                    navLinks[viewId].classList.add('active');
                }

                if (viewId === 'settings') {
                    getStorageEstimate();
                }
            };
            
            const showDetailView = (kolId) => {
                currentKOLId = kolId;
                const kol = kols.find(k => k.id === kolId);
                if (kol) {
                    kolDetailName.textContent = kol.name;
                    renderPlatforms(kolId);
                    // renderCountries(kolId); // Removed as countries are now platform-specific
                    showView('detail');
                }
            };

            const openModalPlatform = async () => { 
                await populatePlatformDropdown();
                addPlatformModal.classList.remove('hidden');
            };

            const closeModalPlatform = () => { 
                addPlatformModal.classList.add('hidden');
                addPlatformForm.reset();
            };

            const openModalEditPlatform = async (platform) => {
                document.getElementById('edit-platform-id').value = platform.id;
                const platformSelect = document.getElementById('edit-platform-name');
                await populatePlatformDropdown(platformSelect, platform.platformCode);
                document.getElementById('edit-platform-handle').value = platform.handle;
                document.getElementById('edit-platform-followers').value = platform.followers;
                editPlatformModal.classList.remove('hidden');
            };

            const closeModalEditPlatform = () => {
                editPlatformModal.classList.add('hidden');
                editPlatformForm.reset();
            };

            const openModalCountry = async (platform, countryToEdit = null) => { // Modified to accept platform and country data
                addCountryModal.classList.remove('hidden');
                countryRowsContainer.innerHTML = '';
                currentPlatformId = platform.id; // Set the current platform ID
                addCountryForm.dataset.platformId = platform.id; // Store platform ID

                if (countryToEdit) {
                    await addCountryRow(countryToEdit);
                    addCountryForm.dataset.mode = 'edit'; // Set mode to edit
                    addCountryForm.dataset.editCountryId = countryToEdit.id; // Store ID of country being edited
                } else {
                    // If adding, render existing countries for this platform
                    renderCountriesInModal(platform);
                    addCountryForm.dataset.mode = 'add'; // Set mode to add
                    delete addCountryForm.dataset.editCountryId; // Clear edit ID
                }
            };

            const closeModalCountry = () => {
                addCountryModal.classList.add('hidden');
                addCountryForm.reset();
                countryRowsContainer.innerHTML = '';
                currentPlatformId = null; // Clear current platform ID
                delete addCountryForm.dataset.mode; // Clear mode
                delete addCountryForm.dataset.editCountryId; // Clear edit ID
                delete addCountryForm.dataset.platformId; // Clear platform ID
            };

            const openManageDetailsModal = async (platform) => {
                currentPlatformId = platform.id;
                manageDetailsModal.classList.remove('hidden');
                await renderCountryManagement(platform);
                await renderGenderManagement(platform);
                await renderAgeRangeManagement(platform);
                await renderPackageManagement(platform);
            };

            const closeManageDetailsModal = () => {
                manageDetailsModal.classList.add('hidden');
                manageDetailsForm.reset();
                currentPlatformId = null;
            };

            const getCountryOptionsFromDB = () => {
                return new Promise((resolve, reject) => {
                    if (!db) {
                        reject("IndexedDB not ready.");
                        return;
                    }
                    const transaction = db.transaction([STORES.countries], 'readonly');
                    const objectStore = transaction.objectStore(STORES.countries);
                    const request = objectStore.getAll();

                    request.onsuccess = (event) => {
                        resolve(event.target.result);
                    };
                    request.onerror = (event) => {
                        reject('Error fetching countries from IndexedDB: ' + event.target.error);
                    };
                });
            };

            const getAgeRangeOptionsFromDB = () => {
                return new Promise((resolve, reject) => {
                    if (!db) {
                        reject("IndexedDB not ready.");
                        return;
                    }
                    const transaction = db.transaction([STORES.ageRanges], 'readonly');
                    const objectStore = transaction.objectStore(STORES.ageRanges);
                    const request = objectStore.getAll();

                    request.onsuccess = (event) => {
                        resolve(event.target.result);
                    };
                    request.onerror = (event) => {
                        reject('Error fetching age ranges from IndexedDB: ' + event.target.error);
                    };
                });
            };

            const getGenderOptionsFromDB = () => {
                return new Promise((resolve, reject) => {
                    if (!db) {
                        reject("IndexedDB not ready.");
                        return;
                    }
                    const transaction = db.transaction([STORES.genders], 'readonly');
                    const objectStore = transaction.objectStore(STORES.genders);
                    const request = objectStore.getAll();

                    request.onsuccess = (event) => {
                        resolve(event.target.result);
                    };
                    request.onerror = (event) => {
                        reject('Error fetching genders from IndexedDB: ' + event.target.error);
                    };
                });
            };

            const getPackageOptionsFromDB = () => {
                return new Promise((resolve, reject) => {
                    if (!db) {
                        reject("IndexedDB not ready.");
                        return;
                    }
                    const transaction = db.transaction([STORES.packages], 'readonly');
                    const objectStore = transaction.objectStore(STORES.packages);
                    const request = objectStore.getAll();

                    request.onsuccess = (event) => {
                        resolve(event.target.result);
                    };
                    request.onerror = (event) => {
                        reject('Error fetching packages from IndexedDB: ' + event.target.error);
                    };
                });
            };

            const renderCountryManagement = async (platform) => {
                countriesManagementContainer.innerHTML = '';
                const countryOptions = await getCountryOptionsFromDB();
                (platform.countries || []).forEach(country => {
                    const row = createDynamicInputRow(country, countryOptions, 'countryCode', platform.followers);
                    countriesManagementContainer.appendChild(row);
                });
            };

            const renderGenderManagement = async (platform) => {
                gendersManagementContainer.innerHTML = '';
                const genderOptions = await getGenderOptionsFromDB();
                (platform.genders || []).forEach(gender => {
                    const row = createDynamicInputRow(gender, genderOptions, 'genderCode', platform.followers);
                    gendersManagementContainer.appendChild(row);
                });
            };

            const renderAgeRangeManagement = async (platform) => {
                ageRangesManagementContainer.innerHTML = '';
                const ageRangeOptions = await getAgeRangeOptionsFromDB();
                (platform.ageRanges || []).forEach(ageRange => {
                    const row = createDynamicInputRow(ageRange, ageRangeOptions, 'ageRangeCode', platform.followers);
                    ageRangesManagementContainer.appendChild(row);
                });
            };

            const renderPackageManagement = async (platform) => {
                packagesManagementContainer.innerHTML = '';
                const packageOptions = await getPackageOptionsFromDB();
                packageOptions.forEach(pkg => {
                    const existingPackage = (platform.packages || []).find(p => p.packageCode === pkg.code);
                    const isEnabled = !!existingPackage;
                    const quotationPrice = existingPackage ? existingPackage.quotationPrice : '';

                    const packageDiv = document.createElement('div');
                    packageDiv.classList.add('package-row');
                    packageDiv.innerHTML = `
                        <label>
                            <input type="checkbox" data-code="${pkg.code}" ${isEnabled ? 'checked' : ''}>
                            ${pkg.desc}
                        </label>
                        <div class="input-group">
                            <label>Quotation Price</label>
                            <input type="number" class="quotation-price-input" value="${quotationPrice}" step="0.01" ${!isEnabled ? 'disabled' : ''}>
                        </div>
                    `;
                    packagesManagementContainer.appendChild(packageDiv);

                    const checkbox = packageDiv.querySelector('input[type="checkbox"]');
                    const priceInput = packageDiv.querySelector('.quotation-price-input');
                    checkbox.addEventListener('change', () => {
                        priceInput.disabled = !checkbox.checked;
                        if (!checkbox.checked) {
                            priceInput.value = '';
                        }
                    });
                });
            };

            const createDynamicInputRow = (item, options, codeKey, totalFollowers) => {
                const rowDiv = document.createElement('div');
                rowDiv.classList.add('country-input-row'); // Reusing existing style
                
                let labelText = 'Code';
                if (codeKey.includes('country')) {
                    labelText = 'Country';
                } else if (codeKey.includes('ageRange')) {
                    labelText = 'Age Range';
                } else if (codeKey.includes('gender')) {
                    labelText = 'Gender';
                }

                rowDiv.innerHTML = `
                    <div class="input-group">
                        <label>${labelText}</label>
                        <select class="code-select" required>
                            <option value="">Select</option>
                            ${options.map(opt => `<option value="${opt.code}" ${item[codeKey] === opt.code ? 'selected' : ''}>${opt.desc}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Percentage</label>
                        <input type="number" class="percentage-input" value="${item.percentage || ''}" step="0.01">
                    </div>
                    <div class="input-group">
                        <label>Exact Number</label>
                        <input type="number" class="exact-number-input" value="${item.exactNumber || ''}">
                    </div>
                    <button type="button" class="btn-danger btn-delete-row">Delete</button>
                `;

                const percentageInput = rowDiv.querySelector('.percentage-input');
                const exactNumberInput = rowDiv.querySelector('.exact-number-input');

                percentageInput.addEventListener('input', () => {
                    const percentage = parseFloat(percentageInput.value);
                    if (!isNaN(percentage) && totalFollowers > 0) {
                        exactNumberInput.value = Math.round((percentage / 100) * totalFollowers);
                    } else {
                        exactNumberInput.value = '';
                    }
                });

                exactNumberInput.addEventListener('input', () => {
                    const exactNumber = parseInt(exactNumberInput.value, 10);
                    if (!isNaN(exactNumber) && totalFollowers > 0) {
                        percentageInput.value = ((exactNumber / totalFollowers) * 100).toFixed(2);
                    } else {
                        percentageInput.value = '';
                    }
                });

                rowDiv.querySelector('.btn-delete-row').addEventListener('click', () => rowDiv.remove());
                return rowDiv;
            };

            const addCountryRow = async (country = {}) => {
                const rowDiv = document.createElement('div');
                rowDiv.classList.add('country-input-row');

                try {
                    const countryOptions = await getCountryOptionsFromDB();
                    const selectHtml = `
                        <select class="country-code-select" required>
                            <option value="">Select Country</option>
                            ${countryOptions.map(opt => `<option value="${opt.code}" ${country.countryCode === opt.code ? 'selected' : ''}>${opt.desc}</option>`).join('')}
                        </select>
                    `;

                    rowDiv.innerHTML = `
                        ${selectHtml}
                        <input type="number" class="country-percentage-input" placeholder="Percentage" value="${country.percentage || ''}" step="0.01">
                        <input type="number" class="country-exact-number-input" placeholder="Exact Number" value="${country.exactNumber || ''}">
                        <button type="button" class="btn-danger btn-delete-row">Delete</button>
                    `;
                    countryRowsContainer.appendChild(rowDiv);

                    const percentageInput = rowDiv.querySelector('.country-percentage-input');
                    const exactNumberInput = rowDiv.querySelector('.country-exact-number-input');
                } catch (error) {
                    console.error('Failed to add country row:', error);
                    alert('Could not load country options. Please try again.');
                }

                const calculateTotalFollowersForPlatform = (kolId, platformId) => {
                    const kol = kols.find(k => k.id === kolId);
                    const platform = kol ? kol.platforms.find(p => p.id === platformId) : null;
                    return platform ? platform.followers : 0;
                };

                const totalFollowersOfCurrentPlatform = calculateTotalFollowersForPlatform(currentKOLId, currentPlatformId);

                const percentageInput = rowDiv.querySelector('.country-percentage-input');
                const exactNumberInput = rowDiv.querySelector('.country-exact-number-input');

                percentageInput.addEventListener('input', () => {
                    const percentage = parseFloat(percentageInput.value);
                    if (!isNaN(percentage) && totalFollowersOfCurrentPlatform > 0) {
                        exactNumberInput.value = Math.round((percentage / 100) * totalFollowersOfCurrentPlatform);
                    } else if (percentageInput.value === '') {
                        exactNumberInput.value = ''; // Clear exact number if percentage is cleared
                    }
                });

                exactNumberInput.addEventListener('input', () => {
                    const exactNumber = parseInt(exactNumberInput.value, 10);
                    if (!isNaN(exactNumber) && totalFollowersOfCurrentPlatform > 0) {
                        percentageInput.value = ((exactNumber / totalFollowersOfCurrentPlatform) * 100).toFixed(2);
                    } else if (exactNumberInput.value === '') {
                        percentageInput.value = ''; // Clear percentage if exact number is cleared
                    }
                });

                rowDiv.querySelector('.btn-delete-row').addEventListener('click', (e) => {
                    e.target.closest('.country-input-row').remove();
                });
            };

            // --- EVENT HANDLING ---
            navLinks.view.addEventListener('click', (e) => {
                e.preventDefault();
                showView('view');
            });

            addKolBtnFromView.addEventListener('click', (e) => {
                e.preventDefault();
                showView('add');
            });

            navLinks.settings.addEventListener('click', (e) => {
                e.preventDefault();
                showView('settings');
            });

            navLinks.generalCode.addEventListener('click', (e) => {
                e.preventDefault();
                showView('generalCode');
                loadAllGeneralCodeData();
            });

            addKolForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const newNameInput = document.getElementById('add-name');
                const newName = newNameInput.value.trim();

                if (newName) {
                    const newKOL = {
                        id: nextId++,
                        name: newName,
                        platforms: [],
                        countries: [] 
                    };
                    kols.push(newKOL);
                    saveKOLsToDB(); 
                    renderKOLs();
                    showDetailView(newKOL.id);
                    newNameInput.value = '';
                }
            });

            cancelAddKolBtn.addEventListener('click', () => {
                showView('view');
            });

            kolListBody.addEventListener('click', (e) => {
                const target = e.target;
                const id = parseInt(target.dataset.id, 10);

                if (target.classList.contains('kol-name-link')) {
                    e.preventDefault();
                    showDetailView(id);
                }

                if (target.classList.contains('btn-danger')) {
                    if (confirm('Are you sure you want to delete this KOL? This will remove all their platform data.')) {
                        kols = kols.filter(kol => kol.id !== id);
                        saveKOLsToDB(); 
                        renderKOLs();
                        // If deleting the currently viewed KOL, go back to the list
                        if (currentKOLId === id) {
                            showView('view');
                        }
                    }
                }
            });
            
            backToListBtn.addEventListener('click', () => {
                currentKOLId = null;
                showView('view');
            });

            addPlatformBtn.addEventListener('click', openModalPlatform); 
            modalCloseBtnPlatform.addEventListener('click', closeModalPlatform); 
            modalOverlayPlatform.addEventListener('click', (e) => { 
                if(e.target === modalOverlayPlatform) {
                    closeModalPlatform();
                }
            });

            addPlatformForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const kol = kols.find(k => k.id === currentKOLId);
                if (kol) {
                    const platformSelect = document.getElementById('add-platform-name');
                    const platformCode = platformSelect.value;

                    // Check for duplicates
                    const isDuplicate = kol.platforms.some(p => p.platformCode === platformCode);
                    if (isDuplicate) {
                        alert('This platform already exists for this KOL.');
                        return;
                    }

                    const newPlatform = {
                        platformName: platformSelect.options[platformSelect.selectedIndex].text,
                        platformCode: platformCode,
                        handle: document.getElementById('add-platform-handle').value,
                        followers: parseInt(document.getElementById('add-platform-followers').value, 10),
                        id: 'p' + nextPlatformId++
                    };
                    kol.platforms.push(newPlatform);
                    saveKOLsToDB(); 
                    renderPlatforms(currentKOLId);
                    renderKOLs(); 
                    closeModalPlatform(); 
                }
            });

            kolPlatformsList.addEventListener('click', (e) => {
                const target = e.target;
                const platformId = target.closest('td').querySelector('[data-platform-id]')?.dataset.platformId || target.closest('td').querySelector('[data-id]')?.dataset.id;
                const kol = kols.find(k => k.id === currentKOLId);
                if (!kol) return;

                const platform = kol.platforms.find(p => p.id === platformId);
                if (!platform) return;

                if (target.classList.contains('btn-edit-platform')) {
                    openModalEditPlatform(platform);
                } else if (target.classList.contains('btn-manage-details')) {
                    openManageDetailsModal(platform);
                } else if (target.classList.contains('btn-delete-platform')) {
                    if (confirm('Are you sure you want to delete this platform?')) {
                        kol.platforms = kol.platforms.filter(p => p.id !== platformId);
                        saveKOLsToDB();
                        renderPlatforms(currentKOLId);
                        renderKOLs();
                    }
                }
            });

            // Removed addCountryBtn.addEventListener as countries are now platform-specific
            modalCloseBtnCountry.addEventListener('click', closeModalCountry);
            modalOverlayCountry.addEventListener('click', (e) => {
                if(e.target === modalOverlayCountry) {
                    closeModalCountry();
                }
            });

            addCountryRowBtn.addEventListener('click', async () => {
                await addCountryRow();
            });

            addCountryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const kol = kols.find(k => k.id === currentKOLId);
                const platform = kol ? kol.platforms.find(p => p.id === currentPlatformId) : null;
                if (!platform) return;

                const countryRows = countryRowsContainer.querySelectorAll('.country-input-row');
                const updatedCountries = [];
                let hasError = false;
                const submittedCountryCodes = new Set();

                // Use a for...of loop to be able to exit early
                for (const row of countryRows) {
                    const countryCode = row.querySelector('.country-code-select').value;
                    const percentageInputVal = row.querySelector('.country-percentage-input').value;
                    const exactNumberInputVal = row.querySelector('.country-exact-number-input').value;

                    const percentage = parseFloat(percentageInputVal);
                    const exactNumber = parseInt(exactNumberInputVal, 10);

                    if (countryCode === '') {
                        hasError = true;
                        alert('Please select a Country Code for all rows.');
                        break;
                    }
                    if (percentageInputVal === '' && exactNumberInputVal === '') {
                        hasError = true;
                        alert('Please fill in either Percentage or Exact Number for each country row.');
                        break;
                    }
                    if (percentageInputVal !== '' && isNaN(percentage)) {
                        hasError = true;
                        alert('Invalid Percentage value.');
                        break;
                    }
                    if (exactNumberInputVal !== '' && isNaN(exactNumber)) {
                        hasError = true;
                        alert('Invalid Exact Number value.');
                        break;
                    }

                    if (submittedCountryCodes.has(countryCode)) {
                        hasError = true;
                        alert(`Country code "${countryCode}" is duplicated in the submission.`);
                        break;
                    }

                    // Try to find an existing country to reuse its ID.
                    const existingCountry = platform.countries.find(c => c.countryCode === countryCode);

                    updatedCountries.push({
                        countryCode,
                        percentage: percentageInputVal !== '' ? percentage : null,
                        exactNumber: exactNumberInputVal !== '' ? exactNumber : null,
                        id: existingCountry ? existingCountry.id : 'c' + nextCountryId++
                    });
                    submittedCountryCodes.add(countryCode);
                }

                if (hasError) return;

                // Replace the old countries array with the new one from the modal
                platform.countries = updatedCountries;
                
                saveKOLsToDB();
                renderPlatforms(currentKOLId); // Re-render platforms to show updated country count if applicable
                closeModalCountry();
            });


            modalCloseBtnEditPlatform.addEventListener('click', closeModalEditPlatform);
            modalOverlayEditPlatform.addEventListener('click', (e) => {
                if (e.target === modalOverlayEditPlatform) {
                    closeModalEditPlatform();
                }
            });

            editPlatformForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const platformId = document.getElementById('edit-platform-id').value;
                const kol = kols.find(k => k.id === currentKOLId);
                if (kol) {
                    const platform = kol.platforms.find(p => p.id === platformId);
                    if (platform) {
                        const platformSelect = document.getElementById('edit-platform-name');
                        const platformCode = platformSelect.value;

                        // Check for duplicates, excluding the current platform being edited
                        const isDuplicate = kol.platforms.some(p => p.platformCode === platformCode && p.id !== platformId);
                        if (isDuplicate) {
                            alert('This platform already exists for this KOL.');
                            return;
                        }

                        platform.platformName = platformSelect.options[platformSelect.selectedIndex].text;
                        platform.platformCode = platformCode;
                        platform.handle = document.getElementById('edit-platform-handle').value;
                        platform.followers = parseInt(document.getElementById('edit-platform-followers').value, 10);
                        saveKOLsToDB();
                        renderPlatforms(currentKOLId);
                        renderKOLs();
                        closeModalEditPlatform();
                    }
                }
            });

            manageDetailsCloseBtn.addEventListener('click', closeManageDetailsModal);
            cancelManageDetailsBtn.addEventListener('click', closeManageDetailsModal);

            addManagedCountryRowBtn.addEventListener('click', async () => {
                const kol = kols.find(k => k.id === currentKOLId);
                const platform = kol ? kol.platforms.find(p => p.id === currentPlatformId) : null;
                if (!platform) return;
                const countryOptions = await getCountryOptionsFromDB();
                const row = createDynamicInputRow({}, countryOptions, 'countryCode', platform.followers);
                countriesManagementContainer.appendChild(row);
            });

            addManagedAgeRangeRowBtn.addEventListener('click', async () => {
                const kol = kols.find(k => k.id === currentKOLId);
                const platform = kol ? kol.platforms.find(p => p.id === currentPlatformId) : null;
                if (!platform) return;
                const ageRangeOptions = await getAgeRangeOptionsFromDB();
                const row = createDynamicInputRow({}, ageRangeOptions, 'ageRangeCode', platform.followers);
                ageRangesManagementContainer.appendChild(row);
            });

            addManagedGenderRowBtn.addEventListener('click', async () => {
                const kol = kols.find(k => k.id === currentKOLId);
                const platform = kol ? kol.platforms.find(p => p.id === currentPlatformId) : null;
                if (!platform) return;
                const genderOptions = await getGenderOptionsFromDB();
                const row = createDynamicInputRow({}, genderOptions, 'genderCode', platform.followers);
                gendersManagementContainer.appendChild(row);
            });

            manageDetailsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const kol = kols.find(k => k.id === currentKOLId);
                const platform = kol ? kol.platforms.find(p => p.id === currentPlatformId) : null;
                if (!platform) return;

                // Save countries
                const countryRows = countriesManagementContainer.querySelectorAll('.country-input-row');
                const updatedCountries = [];
                countryRows.forEach(row => {
                    const code = row.querySelector('.code-select').value;
                    const percentage = parseFloat(row.querySelector('.percentage-input').value);
                    const exactNumber = parseInt(row.querySelector('.exact-number-input').value, 10);
                    if (code && (!isNaN(percentage) || !isNaN(exactNumber))) {
                        updatedCountries.push({ countryCode: code, percentage: percentage || null, exactNumber: exactNumber || null });
                    }
                });
                platform.countries = updatedCountries;

                // Save genders
                const genderRows = gendersManagementContainer.querySelectorAll('.country-input-row');
                const updatedGenders = [];
                genderRows.forEach(row => {
                    const code = row.querySelector('.code-select').value;
                    const percentage = parseFloat(row.querySelector('.percentage-input').value);
                    const exactNumber = parseInt(row.querySelector('.exact-number-input').value, 10);
                    if (code && (!isNaN(percentage) || !isNaN(exactNumber))) {
                        updatedGenders.push({ genderCode: code, percentage: percentage || null, exactNumber: exactNumber || null });
                    }
                });
                platform.genders = updatedGenders;

                // Save age ranges
                const ageRangeRows = ageRangesManagementContainer.querySelectorAll('.country-input-row');
                const updatedAgeRanges = [];
                ageRangeRows.forEach(row => {
                    const code = row.querySelector('.code-select').value;
                    const percentage = parseFloat(row.querySelector('.percentage-input').value);
                    const exactNumber = parseInt(row.querySelector('.exact-number-input').value, 10);
                    if (code && (!isNaN(percentage) || !isNaN(exactNumber))) {
                        updatedAgeRanges.push({ ageRangeCode: code, percentage: percentage || null, exactNumber: exactNumber || null });
                    }
                });
                platform.ageRanges = updatedAgeRanges;

                // Save packages
                const packageRows = packagesManagementContainer.querySelectorAll('.package-row');
                const updatedPackages = [];
                packageRows.forEach(row => {
                    const checkbox = row.querySelector('input[type="checkbox"]');
                    if (checkbox.checked) {
                        const code = checkbox.dataset.code;
                        const price = parseFloat(row.querySelector('.quotation-price-input').value);
                        updatedPackages.push({ packageCode: code, quotationPrice: isNaN(price) ? 0 : price });
                    }
                });
                platform.packages = updatedPackages;

                saveKOLsToDB();
                closeManageDetailsModal();
            });
            
            // Remove the old addCountryBtn listener (already removed from HTML but for safety)
            // addCountryBtn.addEventListener('click', () => openModalCountry());
            
            // Remove the old kolCountriesList listener as its functionality is moved
            // kolCountriesList.addEventListener('click', (e) => { /* ... */ });

            // --- General Code Functions ---
            const openGeneralCodeModal = (storeName, title, data = {}) => {
                currentGeneralCodeStore = storeName;
                generalCodeModalTitle.textContent = title;
                generalCodeIdInput.value = data.id || '';
                generalCodeCodeInput.value = data.code || '';
                generalCodeDescInput.value = data.desc || '';
                generalCodeModal.classList.remove('hidden');
            };

            const closeGeneralCodeModal = () => {
                generalCodeModal.classList.add('hidden');
                generalCodeForm.reset();
            };

            const loadGeneralCodeData = (storeName, listElement) => {
                const transaction = db.transaction([storeName], 'readonly');
                const objectStore = transaction.objectStore(storeName);
                const request = objectStore.getAll();

                request.onsuccess = (event) => {
                    const items = event.target.result;
                    listElement.innerHTML = '';
                    items.forEach(item => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${item.code}</td>
                            <td>${item.desc}</td>
                            <td>
                                <button class="btn-edit" data-id="${item.id}" data-store="${storeName}">Edit</button>
                                <button class="btn-danger" data-id="${item.id}" data-store="${storeName}">Delete</button>
                            </td>
                        `;
                        listElement.appendChild(row);
                    });
                };
            };

            const loadAllGeneralCodeData = () => {
                loadGeneralCodeData(STORES.countries, countriesList);
                loadGeneralCodeData(STORES.genders, gendersList);
                loadGeneralCodeData(STORES.ageRanges, ageRangesList);
                loadGeneralCodeData(STORES.packages, packagesList);
                loadGeneralCodeData(STORES.platforms, platformsList);
            };

            generalCodeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const id = parseInt(generalCodeIdInput.value);
                const code = generalCodeCodeInput.value.trim();
                const desc = generalCodeDescInput.value.trim();

                if (!code || !desc) {
                    alert('Code and Description are required.');
                    return;
                }

                const transaction = db.transaction([currentGeneralCodeStore], 'readwrite');
                const objectStore = transaction.objectStore(currentGeneralCodeStore);

                const data = { code, desc };
                if (id) {
                    data.id = id;
                }

                const request = objectStore.put(data);

                request.onsuccess = () => {
                    closeGeneralCodeModal();
                    loadAllGeneralCodeData();
                };
            });

            addCountryBtn.addEventListener('click', () => openGeneralCodeModal(STORES.countries, 'Add/Edit Country'));
            addGenderBtn.addEventListener('click', () => openGeneralCodeModal(STORES.genders, 'Add/Edit Gender'));
            addAgeRangeBtn.addEventListener('click', () => openGeneralCodeModal(STORES.ageRanges, 'Add/Edit Age Range'));
            addPackageBtn.addEventListener('click', () => openGeneralCodeModal(STORES.packages, 'Add/Edit Package'));
            addPlatformBtnGeneral.addEventListener('click', () => openGeneralCodeModal(STORES.platforms, 'Add/Edit Platform'));

            generalCodeCloseBtn.addEventListener('click', closeGeneralCodeModal);
            generalCodeModal.addEventListener('click', (e) => {
                if (e.target === generalCodeModal) {
                    closeGeneralCodeModal();
                }
            });

            document.getElementById('general-code-section').addEventListener('click', (e) => {
                const target = e.target;
                if (target.classList.contains('btn-edit')) {
                    const id = parseInt(target.dataset.id);
                    const storeName = target.dataset.store;
                    const transaction = db.transaction([storeName], 'readonly');
                    const objectStore = transaction.objectStore(storeName);
                    const request = objectStore.get(id);

                    request.onsuccess = (event) => {
                        const data = event.target.result;
                        let title = '';
                        if (storeName === STORES.countries) title = 'Edit Country';
                        if (storeName === STORES.genders) title = 'Edit Gender';
                        if (storeName === STORES.ageRanges) title = 'Edit Age Range';
                        if (storeName === STORES.packages) title = 'Edit Package';
                        if (storeName === STORES.platforms) title = 'Edit Platform';
                        openGeneralCodeModal(storeName, title, data);
                    };
                }

                if (target.classList.contains('btn-danger')) {
                    if (confirm('Are you sure you want to delete this item?')) {
                        const id = parseInt(target.dataset.id);
                        const storeName = target.dataset.store;
                        const transaction = db.transaction([storeName], 'readwrite');
                        const objectStore = transaction.objectStore(storeName);
                        objectStore.delete(id);
                        loadAllGeneralCodeData();
                    }
                }
            });

            // --- INITIALIZATION ---
            // Moved renderKOLs and showView to loadKOLsFromDB callback
            const generateReportBtn = document.getElementById('generate-report-btn');
            const reportList = document.getElementById('report-list');
            let kolFollowersChart = null;
            let kolPackageQuotationChart = null;
            let aiGeneratedChart = null;
            let currentFollowersReportData = [];
            const aiChartBtn = document.getElementById('ai-chart-btn');
            const aiExplanationDiv = document.getElementById('ai-explanation');
            const aiControlsDiv = document.getElementById('ai-controls');
            const aiChartTypeSelect = document.getElementById('ai-chart-type-select');
            const aiSummaryPrompt = document.getElementById('ai-summary-prompt');
            const aiLanguageSelect = document.getElementById('ai-language-select');

            // --- AI Agent Functions ---
            const generationConfig = {
                temperature: 1,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 65536,
                responseMimeType: "text/plain",
            };

            var KEY = "20250710";

            function decrypt(ciphertext) {
                let decodedMessage = '';
                for (let i = 0; i < ciphertext.length; i += 3) {
                    let numStr = ciphertext.slice(i, i + 3);
                    let encryptedChar = parseInt(numStr);
                    let keyChar = KEY.charCodeAt((i / 3) % KEY.length);
                    let decryptedChar = encryptedChar ^ keyChar;
                    decodedMessage += String.fromCharCode(decryptedChar);
                }
                return decodedMessage;
            }

            var apiKeys = [
                "115121072084099078114106098029005120126090119105075090121123125069122116094086126071121120084125067121099109004000086",
                "115121072084099078115106107073097127003091070122066093074007070026117113095097102119085065092117113084101066074065070"
            ];

            let currentKeyIndex = 0;

            async function sendApiRequest(url, requestBody) {
                let tries = 0;
                const maxTries = apiKeys.length;

                while (tries < maxTries) {
                    var apiKey = apiKeys[currentKeyIndex];
                    apiKey = decrypt(apiKey);

                    const fullUrl = url + "?key=" + apiKey;

                    try {
                        const response = await fetch(fullUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(requestBody),
                        });

                        if (response.ok) {
                            const data = await response.json();
                            return data;
                        } else {
                            currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
                            tries++;
                        }
                    } catch (err) {
                        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
                        tries++;
                    }
                }
                throw new Error("All API keys failed.");
            }

            async function startChatSession(selectedModel) {
                return {
                    sendMessage: async function(messageData) {
                        let userMessage = typeof messageData === "string" ?
                            { role: "user", parts: [{ text: messageData }] } :
                            messageData;
                        const requestBody = { contents: [userMessage], generationConfig };
                        const url = "https://generativelanguage.googleapis.com/v1beta/models/" + selectedModel + ":generateContent";

                        const result = await sendApiRequest(url, requestBody);

                        if (result.candidates && result.candidates.length > 0) {
                            return result.candidates[0].content.parts;
                        } else {
                            throw new Error("No response from API");
                        }
                    }
                };
            }

            function extractFirstJSONObject(text) {
				text = text.trim();
				if (text.startsWith("```json")) text = text.slice(7).trim();
				if (text.endsWith("```")) text = text.slice(0, -3).trim();
				
				let start = text.indexOf('{');
					let startArr = text.indexOf('[');
					if (startArr >= 0 && (startArr < start || start < 0)) start = startArr;
					if (start < 0) throw new Error("No JSON object found");
					
					let braceCount = 0;
					let inString = false;
					for (let i = start; i < text.length; i++) {
						const ch = text[i];
						if (ch === '"' && text[i - 1] !== '\\') inString = !inString;
						if (!inString) {
							if (ch === '{' || ch === '[') braceCount++;
							else if (ch === '}' || ch === ']') braceCount--;
							if (braceCount === 0) return text.slice(start, i + 1);
						}
					}
					throw new Error("No complete JSON object found");
				}

            async function aiAgentGenerateChartConfig(cleanData, chartType, maxRetry = 3) {
                let promptChartType = chartType === 'area' ? 'line' : chartType;
                const prompt = `
                    You are a professional assistant generating Chart.js configuration.
                    Input: A JSON array of data objects representing tabular data:
                    ${JSON.stringify(cleanData)}
                    Task: Generate a **valid JSON object** representing a Chart.js configuration for a "${promptChartType}" chart.
                    Requirements:
                    - Include these keys: "type", "data", and "options".
                    - In "data", create "labels" from suitable data columns, and "datasets" with numeric data.
                    - In "options", include axis titles, responsive settings, legend and tooltip configuration objects.
                    - Use consistent and visually distinct colors for dataset backgrounds and borders.
                    - Do NOT include any JavaScript functions, callbacks, or expressions.
                    - For any callbacks or dynamic features, use empty objects or omit them.
                    - Format numeric values as plain numbers, no string formatting.
                    - The output must be parsable by JSON.parse().
                    - Output ONLY the JSON object, no additional text or explanation.
                    If input data is invalid or insufficient to generate a chart, output an empty JSON object: {}.
                `;
                let attempt = 0;
                while (attempt < maxRetry) {
                    try {
                        const session = await startChatSession("gemini-2.5-flash");
                        const responseParts = await session.sendMessage(prompt);
                        const responseText = responseParts.filter(p => p.text).map(p => p.text).join('').trim();
                        const jsonText = extractFirstJSONObject(responseText);
                        const chartConfig = JSON.parse(jsonText);
                        return chartConfig;
                    } catch (err) {
                        console.log("Retry: aiAgentGenerateChartConfig");
                        attempt++;
                        if (attempt >= maxRetry) throw new Error("Failed to generate chart config: " + err.message);
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
            }

            async function aiAgentGenerateExplanation(chartConfig, userPrompt = '', language = 'English', maxRetry = 3) {
                const prompt = `
                    You are a senior data analyst preparing a professional report for senior management.
                    Please provide the report in ${language}.
                    Given the following Chart.js configuration JSON data representing key performance metrics from an ERP system process:
                    ${JSON.stringify(chartConfig, null, 2)}
                    
                    ${userPrompt ? `The user has provided the following specific request for the summary: "${userPrompt}"` : ''}

                    Please provide a clear, concise, and formal report structured as follows:
                    1. Executive Summary — Describe the chart’s purpose and summarize the overall findings.
                    2. Key Observations — Identify important insights like trends, comparisons, anomalies, ratios, etc.
                    3. Business Implications — Explain impact on business or operations.
                    4. Actionable Recommendations — Practical suggestions based on data.
                    5. Potential Risks or Considerations — Any risks or data issues to monitor.
                    6. Data Summary — Summarize key data points.
                    
                    ${userPrompt ? 'Address the user\'s specific request in your analysis.' : ''}
                    Use professional language appropriate for senior management. Present the report in bullet points or concise paragraphs. Output only the report text.
                `;
                let attempt = 0;
                while (attempt < maxRetry) {
                    try {
                        const session = await startChatSession("gemini-2.5-flash");
                        const responseParts = await session.sendMessage(prompt);
                        const explanationText = responseParts.filter(p => p.text).map(p => p.text).join('\n').trim();
                        return explanationText;
                    } catch (err) {
                        console.log("Retry: aiAgentGenerateExplanation");
                        attempt++;
                        if (attempt >= maxRetry) throw new Error("Failed to generate explanation: " + err.message);
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
            }

            const handleAiChartGeneration = async () => {
                if (currentFollowersReportData.length === 0) {
                    alert('Please generate a report first.');
                    return;
                }

                const selectedChartType = aiChartTypeSelect.value;
                const userPrompt = aiSummaryPrompt.value.trim();
                const selectedLanguage = aiLanguageSelect.value;

                aiChartBtn.disabled = true;
                aiChartBtn.textContent = 'Analyzing...';
                aiExplanationDiv.style.display = 'block';
                aiExplanationDiv.innerHTML = '<i>AI is analyzing the data and generating a new chart...</i>';

                try {
                    const chartConfig = await aiAgentGenerateChartConfig(currentFollowersReportData, selectedChartType);
                    
                    aiExplanationDiv.innerHTML = '<i>AI is generating the explanation...</i>';
                    const explanation = await aiAgentGenerateExplanation(chartConfig, userPrompt, selectedLanguage);
                    aiExplanationDiv.innerHTML = marked.parse(explanation);

                    renderAiGeneratedChart(chartConfig.data, chartConfig.type, chartConfig.options);

                } catch (error) {
                    console.error('AI Chart Generation Error:', error);
                    alert('An error occurred while generating the AI chart and explanation.');
                    aiExplanationDiv.innerHTML = '<p style="color: red;">Failed to generate AI analysis.</p>';
                } finally {
                    aiChartBtn.disabled = false;
                    aiChartBtn.textContent = 'AI Chart Analysis';
                }
            };
            
            aiChartBtn.addEventListener('click', handleAiChartGeneration);

            const renderFollowersChart = (chartData, type = 'bar', options = { scales: { y: { beginAtZero: true } } }) => {
                const ctx = document.getElementById('kol-followers-chart').getContext('2d');
                if (kolFollowersChart) {
                    kolFollowersChart.destroy();
                }
                kolFollowersChart = new Chart(ctx, {
                    type: type,
                    data: chartData,
                    options: options
                });
            };

            const renderAiGeneratedChart = (chartData, type = 'bar', options = { scales: { y: { beginAtZero: true } } }) => {
                const ctx = document.getElementById('ai-generated-chart').getContext('2d');
                if (aiGeneratedChart) {
                    aiGeneratedChart.destroy();
                }
                aiGeneratedChart = new Chart(ctx, {
                    type: type,
                    data: chartData,
                    options: options
                });
            };

            const renderReport = (data) => {
                reportList.innerHTML = '';
                data.forEach(item => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${item.name}</td>
                        <td>${item.totalFollowers.toLocaleString()}</td>
                    `;
                    reportList.appendChild(row);
                });

                currentFollowersReportData = data;
                aiChartBtn.style.display = 'block';
                aiControlsDiv.style.display = 'block';
                aiExplanationDiv.style.display = 'none';
                aiExplanationDiv.innerHTML = '';

                const chartData = {
                    labels: data.map(item => item.name),
                    datasets: [{
                        label: 'Total Followers',
                        data: data.map(item => item.totalFollowers),
                        backgroundColor: 'rgba(74, 144, 226, 0.5)',
                        borderColor: 'rgba(74, 144, 226, 1)',
                        borderWidth: 1
                    }]
                };
                renderFollowersChart(chartData);
            };

            generateReportBtn.addEventListener('click', () => {
                const selectedPlatform = document.getElementById('platform-select-followers-report').value;

                if (!db) {
                    alert('Database is not ready. Please try again in a moment.');
                    return;
                }
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const objectStore = transaction.objectStore(STORE_NAME);
                const request = objectStore.getAll();

                request.onsuccess = (event) => {
                    const allKOLs = event.target.result;
                    const reportData = allKOLs.map(kol => {
                        let totalFollowers;
                        if (selectedPlatform) {
                            // Filter platforms by the selected platform code and sum their followers
                            totalFollowers = kol.platforms
                                .filter(p => p.platformCode === selectedPlatform)
                                .reduce((sum, p) => sum + p.followers, 0);
                        } else {
                            // If no platform is selected (i.e., "All Platforms"), sum all followers
                            totalFollowers = kol.platforms.reduce((sum, p) => sum + p.followers, 0);
                        }
                        
                        return {
                            name: kol.name,
                            totalFollowers: totalFollowers
                        };
                    }).filter(kol => kol.totalFollowers > 0); // Optionally, filter out KOLs with 0 followers for the selected platform
                    
                    renderReport(reportData);
                };

                request.onerror = (event) => {
                    console.error('Error fetching data for report:', event.target.error);
                    alert('Failed to generate report.');
                };
            });

            // New Report Section Logic
            const reportToggle = document.getElementById('report-toggle');
            const reportDetails = document.getElementById('report-details');
            const reportArrow = reportToggle.querySelector('.arrow');

            reportToggle.addEventListener('click', (e) => {
                e.preventDefault();
                reportDetails.classList.toggle('menu-open');
                reportArrow.classList.toggle('down');
            });

            navLinks.kolFollowersReport.addEventListener('click', (e) => {
                e.preventDefault();
                showView('report');
                populateFollowersPlatformSelect();
            });

            navLinks.kolPackageQuotationReport.addEventListener('click', (e) => {
                e.preventDefault();
                showView('kolPackageQuotationReport');
                populatePackageSelect();
                populatePlatformSelect();
            });

            const packageSelect = document.getElementById('package-select');
            const platformSelectReport = document.getElementById('platform-select-report');
            const generatePackageReportBtn = document.getElementById('generate-package-report-btn');
            const packageReportList = document.getElementById('package-report-list');

            const populatePackageSelect = async () => {
                const packages = await getPackageOptionsFromDB();
                packageSelect.innerHTML = '<option value="">Select a package</option>';
                packages.forEach(pkg => {
                    const option = document.createElement('option');
                    option.value = pkg.code;
                    option.textContent = pkg.desc;
                    packageSelect.appendChild(option);
                });
            };

            const populatePlatformSelect = async () => {
                const platforms = await getPlatformOptionsFromDB();
                platformSelectReport.innerHTML = '<option value="">All Platforms</option>';
                platforms.forEach(platform => {
                    const option = document.createElement('option');
                    option.value = platform.code;
                    option.textContent = platform.desc;
                    platformSelectReport.appendChild(option);
                });
            };

            const populateFollowersPlatformSelect = async () => {
                const platformFollowersSelect = document.getElementById('platform-select-followers-report');
                const platforms = await getPlatformOptionsFromDB();
                platformFollowersSelect.innerHTML = '<option value="">All Platforms</option>';
                platforms.forEach(platform => {
                    const option = document.createElement('option');
                    option.value = platform.code;
                    option.textContent = platform.desc;
                    platformFollowersSelect.appendChild(option);
                });
            };

            const getPlatformOptionsFromDB = () => {
                return new Promise((resolve, reject) => {
                    if (!db) {
                        reject("IndexedDB not ready.");
                        return;
                    }
                    const transaction = db.transaction([STORES.platforms], 'readonly');
                    const objectStore = transaction.objectStore(STORES.platforms);
                    const request = objectStore.getAll();

                    request.onsuccess = (event) => {
                        resolve(event.target.result);
                    };
                    request.onerror = (event) => {
                        reject('Error fetching platforms from IndexedDB: ' + event.target.error);
                    };
                });
            };

            const populatePlatformDropdown = async (platformSelectElement, selectedValue) => {
                const platformSelect = platformSelectElement || document.getElementById('add-platform-name');
                try {
                    const platforms = await getPlatformOptionsFromDB();
                    platformSelect.innerHTML = '<option value="">Select Platform</option>';
                    platforms.forEach(platform => {
                        const option = document.createElement('option');
                        option.value = platform.code;
                        option.textContent = platform.desc;
                        if (platform.code === selectedValue) {
                            option.selected = true;
                        }
                        platformSelect.appendChild(option);
                    });
                } catch (error) {
                    console.error('Failed to populate platform dropdown:', error);
                    platformSelect.innerHTML = '<option value="">Error loading platforms</option>';
                }
            };

            const renderPackageChart = (data) => {
                const ctx = document.getElementById('kol-package-quotation-chart').getContext('2d');
                if (kolPackageQuotationChart) {
                    kolPackageQuotationChart.destroy();
                }
                kolPackageQuotationChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.map(item => `${item.kolName} (${item.platformName})`),
                        datasets: [{
                            label: 'Quotation Price (SGD)',
                            data: data.map(item => item.quotationPrice),
                            backgroundColor: 'rgba(74, 144, 226, 0.5)',
                            borderColor: 'rgba(74, 144, 226, 1)',
                            borderWidth: 1,
                            yAxisID: 'y-axis-price'
                        }, {
                            label: 'Cost / 1k Followers (SGD)',
                            data: data.map(item => item.followers > 0 ? (item.quotationPrice / item.followers) * 1000 : 0),
                            backgroundColor: 'rgba(255, 193, 7, 0.5)',
                            borderColor: 'rgba(255, 193, 7, 1)',
                            borderWidth: 1,
                            yAxisID: 'y-axis-cost'
                        }]
                    },
                    options: {
                        scales: {
                            'y-axis-price': {
                                type: 'linear',
                                position: 'left',
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Quotation Price (SGD)'
                                }
                            },
                            'y-axis-cost': {
                                type: 'linear',
                                position: 'right',
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Cost / 1k Followers (SGD)'
                                },
                                grid: {
                                    drawOnChartArea: false // only draw grid lines for the first Y axis
                                }
                            }
                        }
                    }
                });
            };

            const renderPackageReport = (data) => {
                packageReportList.innerHTML = '';
                data.forEach(item => {
                    const costPer1k = item.followers > 0 ? (item.quotationPrice / item.followers) * 1000 : 0;
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${item.kolName}</td>
                        <td>${item.platformName}</td>
                        <td>${item.followers.toLocaleString()}</td>
                        <td>${item.quotationPrice.toLocaleString()}</td>
                        <td>${costPer1k.toFixed(2)}</td>
                    `;
                    packageReportList.appendChild(row);
                });
                renderPackageChart(data);
            };

            generatePackageReportBtn.addEventListener('click', async () => {
                const selectedPackageCode = packageSelect.value;
                const selectedPlatform = platformSelectReport.value;

                if (!selectedPackageCode) {
                    alert('Please select a package.');
                    return;
                }

                if (!db) {
                    alert('Database is not ready. Please try again in a moment.');
                    return;
                }

                const transaction = db.transaction([STORE_NAME], 'readonly');
                const objectStore = transaction.objectStore(STORE_NAME);
                const request = objectStore.getAll();

                request.onsuccess = (event) => {
                    const allKOLs = event.target.result;
                    let reportData = [];
                    allKOLs.forEach(kol => {
                        kol.platforms.forEach(platform => {
                            if (platform.packages) {
                                const pkg = platform.packages.find(p => p.packageCode === selectedPackageCode);
                                if (pkg) {
                                    reportData.push({
                                        kolName: kol.name,
                                        platformName: platform.platformName,
                                        followers: platform.followers,
                                        quotationPrice: pkg.quotationPrice
                                    });
                                }
                            }
                        });
                    });

                    if (selectedPlatform) {
                        const platformDesc = platformSelectReport.options[platformSelectReport.selectedIndex].text;
                        reportData = reportData.filter(item => item.platformName === platformDesc);
                    }

                    renderPackageReport(reportData);
                };

                request.onerror = (event) => {
                    console.error('Error fetching data for package report:', event.target.error);
                    alert('Failed to generate package report.');
                };
            });
        });

    // Function to convert bytes to human-readable format
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Function to get IndexedDB usage and quota
    async function getStorageEstimate() {
        const usageElement = document.getElementById('indexeddb-usage');
        const quotaElement = document.getElementById('indexeddb-quota');

        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const { usage, quota } = await navigator.storage.estimate();
                usageElement.textContent = formatBytes(usage);
                quotaElement.textContent = formatBytes(quota);
            } catch (error) {
                console.error('Failed to estimate storage usage:', error);
                usageElement.textContent = 'Error';
                quotaElement.textContent = 'Error';
            }
        } else {
            usageElement.textContent = 'N/A (API not supported)';
            quotaElement.textContent = 'N/A (API not supported)';
            console.warn('StorageManager API not supported in this browser.');
        }
    }

    // --- IndexedDB Export/Import Functions ---

    // Export function
    async function exportIndexedDB() {
        const exportData = {};
        const storeNames = Object.values(STORES);
        const transaction = db.transaction(storeNames, 'readonly');
        let promises = [];

        storeNames.forEach(storeName => {
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.getAll();
            const promise = new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    exportData[storeName] = event.target.result;
                    resolve();
                };
                request.onerror = (event) => {
                    reject(`Error exporting ${storeName}: ${event.target.error}`);
                };
            });
            promises.push(promise);
        });

        try {
            await Promise.all(promises);
            const json = JSON.stringify(exportData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });

            const now = new Date();
            const timestamp = now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0') + '_' +
                String(now.getHours()).padStart(2, '0') + '-' +
                String(now.getMinutes()).padStart(2, '0') + '-' +
                String(now.getSeconds()).padStart(2, '0');
            const filename = `indexedDB_export_${timestamp}.json`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('IndexedDB data exported successfully!');
        } catch (error) {
            console.error('Error exporting IndexedDB:', error);
            alert('Failed to export IndexedDB data.');
        }
    }

    // Import function
    async function importIndexedDB(file) {
        if (!db) {
            alert('IndexedDB not ready. Please try again.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                const storeNames = Object.values(STORES);

                // Check if the imported data is in the old array format for backward compatibility
                if (Array.isArray(data)) {
                    // Handle old format (array of KOLs)
                    const transaction = db.transaction([STORES.kols], 'readwrite');
                    const objectStore = transaction.objectStore(STORES.kols);
                    objectStore.clear();
                    data.forEach(kol => {
                        objectStore.put(kol);
                    });
                    transaction.oncomplete = () => {
                        alert('Old format data imported successfully! Page will reload.');
                        location.reload();
                    };
                    return;
                }
                
                // Handle new format (object with keys for each store)
                if (typeof data !== 'object' || data === null || !storeNames.some(key => key in data)) {
                    alert('Invalid JSON format. Expected an object with store names as keys or an array of KOLs.');
                    return;
                }

                const transaction = db.transaction(storeNames, 'readwrite');

                transaction.oncomplete = () => {
                    console.log('IndexedDB data imported successfully!');
                    alert('IndexedDB data imported successfully! Page will reload to apply changes.');
                    location.reload();
                };

                transaction.onerror = (event) => {
                    console.error('Error importing IndexedDB:', event.target.error);
                    alert('Failed to import IndexedDB data.');
                };

                storeNames.forEach(storeName => {
                    if (data[storeName] && Array.isArray(data[storeName])) {
                        const objectStore = transaction.objectStore(storeName);
                        objectStore.clear(); // Clear existing data
                        data[storeName].forEach(item => {
                            objectStore.put(item);
                        });
                    }
                });

            } catch (e) {
                console.error('Error parsing JSON or importing data:', e);
                alert('Error importing file. Please ensure it is a valid JSON file.');
            }
        };
        reader.readAsText(file);
    }

    // Event Listeners for Export/Import buttons
    document.addEventListener('DOMContentLoaded', () => {
        const exportIndexedDBBtn = document.getElementById('export-indexeddb-btn');
        const importIndexedDBFile = document.getElementById('import-indexeddb-file');
        const importIndexedDBBtn = document.getElementById('import-indexeddb-btn');

        exportIndexedDBBtn.addEventListener('click', exportIndexedDB);

        importIndexedDBBtn.addEventListener('click', () => {
            importIndexedDBFile.click(); // Trigger the hidden file input click
        });

        importIndexedDBFile.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                importIndexedDB(file);
            }
        });
    });
