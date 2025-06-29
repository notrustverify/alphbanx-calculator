/***********************
 *  THEME HANDLING    *
 ***********************/
(function () {
  const themeToggle = document.getElementById("themeToggle");
  const root = document.documentElement;
  const storedTheme = localStorage.getItem("theme") || "light";
  root.setAttribute("data-theme", storedTheme);
  themeToggle.textContent = storedTheme === "dark" ? "☼" : "☾";

  themeToggle.addEventListener("click", () => {
    const current = root.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    themeToggle.textContent = next === "dark" ? "☼" : "☾";
  });
})();

/***********************
 *  ADDRESS SAVING    *
 ***********************/
// Load saved addresses on page load
document.addEventListener('DOMContentLoaded', function() {
  loadSavedAddressesList();
  updateAddressButtons();
  
  // Add event listeners for address input
  const addressInput = document.getElementById('fetchAddress');
  addressInput.addEventListener('input', updateAddressButtons);
  addressInput.addEventListener('paste', updateAddressButtons);
});

// Save current address to localStorage
function saveCurrentAddress() {
  console.log('saveCurrentAddress called'); // Debug log
  const address = document.getElementById('fetchAddress').value.trim();
  console.log('Address value:', address); // Debug log
  
  if (!address) {
    console.log('No address provided'); // Debug log
    showFetchStatus('Please enter an address first', 'error');
    return;
  }
  
  const savedAddresses = getSavedAddresses();
  console.log('Current saved addresses:', savedAddresses); // Debug log
  
  // Check if address already exists
  if (savedAddresses.includes(address)) {
    console.log('Address already exists'); // Debug log
    showFetchStatus('Address already saved', 'error');
    return;
  }
  
  // Add new address
  savedAddresses.push(address);
  localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
  console.log('Address saved to localStorage'); // Debug log
  
  // Visual feedback for quick save button
  const quickSaveBtn = document.getElementById('quickSaveBtn');
  const originalSVG = quickSaveBtn.innerHTML;
  quickSaveBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" fill="currentColor"/></svg>';
  quickSaveBtn.style.background = '#27ae60';
  
  // Reset button after 1 second
  setTimeout(() => {
    quickSaveBtn.innerHTML = originalSVG;
    quickSaveBtn.style.background = '';
  }, 1000);
  
  // Update UI
  loadSavedAddressesList();
  updateAddressButtons();
  showFetchStatus('Address saved successfully', 'success');
}

// Remove selected address from localStorage
function removeSavedAddress() {
  const select = document.getElementById('savedAddresses');
  const selectedAddress = select.value;
  
  if (!selectedAddress) {
    showFetchStatus('Please select an address to remove', 'error');
    return;
  }
  
  const savedAddresses = getSavedAddresses();
  const updatedAddresses = savedAddresses.filter(addr => addr !== selectedAddress);
  
  localStorage.setItem('savedAddresses', JSON.stringify(updatedAddresses));
  
  // Update UI
  loadSavedAddressesList();
  updateAddressButtons();
  showFetchStatus('Address removed successfully', 'success');
}

// Load selected address into input field
function loadSavedAddress() {
  const select = document.getElementById('savedAddresses');
  const selectedAddress = select.value;
  
  if (selectedAddress) {
    document.getElementById('fetchAddress').value = selectedAddress;
    updateAddressButtons();
    
    // Automatically fetch data for the selected address
    fetchCollateralAndBorrowed();
  }
}

// Get saved addresses from localStorage
function getSavedAddresses() {
  const saved = localStorage.getItem('savedAddresses');
  return saved ? JSON.parse(saved) : [];
}

// Load saved addresses into dropdown
function loadSavedAddressesList() {
  const select = document.getElementById('savedAddresses');
  const savedAddresses = getSavedAddresses();
  
  // Clear existing options except the first one
  select.innerHTML = '<option value="">Select saved address...</option>';
  
  // Add saved addresses
  savedAddresses.forEach(address => {
    const option = document.createElement('option');
    option.value = address;
    option.textContent = `${address.substring(0, 8)}...${address.substring(address.length - 8)}`;
    select.appendChild(option);
  });
}

// Update save/remove button states
function updateAddressButtons() {
  console.log('updateAddressButtons called'); // Debug log
  const addressInput = document.getElementById('fetchAddress');
  const savedSelect = document.getElementById('savedAddresses');
  const removeBtn = document.getElementById('removeAddressBtn');
  const quickSaveBtn = document.getElementById('quickSaveBtn');
  
  const currentAddress = addressInput.value.trim();
  const selectedSavedAddress = savedSelect.value;
  const savedAddresses = getSavedAddresses();
  
  console.log('Current address:', currentAddress); // Debug log
  console.log('Selected saved address:', selectedSavedAddress); // Debug log
  console.log('Saved addresses:', savedAddresses); // Debug log
  
  // Enable save button if address is not empty and not already saved
  const canSave = currentAddress && !savedAddresses.includes(currentAddress);
  console.log('Can save:', canSave); // Debug log
  quickSaveBtn.disabled = !canSave;
  
  // Enable remove button if a saved address is selected
  removeBtn.disabled = !selectedSavedAddress;
  
  console.log('Quick save button disabled:', quickSaveBtn.disabled); // Debug log
  console.log('Remove button disabled:', removeBtn.disabled); // Debug log
}

// Enhanced showFetchStatus function
function showFetchStatus(message, type = 'info') {
  const status = document.getElementById('fetchStatus');
  status.textContent = message;
  status.className = `fetch-status ${type}`;
  
  // Clear status after 3 seconds for success/error messages
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      status.textContent = '';
      status.className = 'fetch-status';
    }, 3000);
  }
}

/***********************
 *  CALCULATOR LOGIC  *
 ***********************/
let alphPrice = null;
let lastUpdateTime = null;
let lastAddressFetchTime = null;
let currentAddress = null;
let currentInterestRate = 5; // Default interest rate of 5%
const MIN_CR = 200; // 200%
const REFRESH_INTERVAL = 30000; // 30s
const ADDRESS_REFRESH_INTERVAL = 60000; // 60s for address data

// Hex to binary decoder function
function hexToBinUnsafe(hex) {
  const bytes = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16))
  }
  return new Uint8Array(bytes)
}

// Base58 encoding function
function bs58Encode(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const base = alphabet.length
  
  let num = 0n
  for (let i = 0; i < bytes.length; i++) {
    num = num * 256n + BigInt(bytes[i])
  }
  
  let result = ''
  while (num > 0) {
    const remainder = Number(num % BigInt(base))
    result = alphabet[remainder] + result
    num = num / BigInt(base)
  }
  
  // Add leading zeros
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result = '1' + result
  }
  
  return result
}

// Convert contract ID to address
function addressFromContractId(contractId) {
  const P2C = 0x03
  const hash = hexToBinUnsafe(contractId)
  const bytes = new Uint8Array([P2C, ...hash])
  return bs58Encode(bytes)
}


// Fetch user's specific borrowed ABD
async function fetchUserBorrowed(userAddress) {
  try {
    // First get the user's position address
    const contractId = await findAddressForParams(userAddress);
    const positionAddress = addressFromContractId(contractId);
    console.log('Contract ID:', contractId, 'Position Address:', positionAddress);
    
    // Then fetch the borrowed amount for that position
    const response = await fetch('https://lb-fullnode-alephium.notrustverify.ch/contracts/call-contract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "args": [],
        "group": 0,
        "address": positionAddress,
        "methodIndex": 9
      })
    });
    
    const data = await response.json();
    if (data.type === "CallContractSucceeded" && data.returns && data.returns[0]) {
      const borrowedValue = data.returns[0].value;
      const borrowedABD = parseInt(borrowedValue) / Math.pow(10, 9);
      return borrowedABD;
    }
    return 0; // Return 0 if no borrowed amount found
  } catch (error) {
    console.error('Error fetching user borrowed:', error);
    return 0; // Return 0 on error
  }
}

// Fetch interest rate
async function fetchInterestRate(positionAddress) {
  try {
    const response = await fetch('https://lb-fullnode-alephium.notrustverify.ch/contracts/call-contract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "args": [],
        "group": 0,
        "address": positionAddress,
        "methodIndex": 5
      })
    });
    
    const data = await response.json();
    if (data.type === "CallContractSucceeded" && data.returns && data.returns[0]) {
      const interestValue = data.returns[0].value;
      // Convert from basis points to percentage (assuming it's in basis points)
      currentInterestRate = parseInt(interestValue); // Store globally
      return currentInterestRate;
    }
    return currentInterestRate; // Return default rate if fetch fails
  } catch (error) {
    console.error('Error fetching interest rate:', error);
    return currentInterestRate; // Return default rate on error
  }
}

// Calculate interest for a given period (in days)
function calculateInterest(borrowedAmount, interestRate, days) {
  if (borrowedAmount <= 0 || interestRate <= 0) {
    return 0;
  }
  
  // Convert annual rate to daily rate and calculate compound interest
  const dailyRate = interestRate / 36500; // 365 days * 100 (for percentage)
  const interestAmount = borrowedAmount * dailyRate * days;
  return interestAmount;
}

// Calculate total amount to reimburse after one year
function calculateYearlyRepayment(borrowedAmount, interestRate) {
  if (borrowedAmount <= 0 || interestRate <= 0) {
    return borrowedAmount;
  }
  
  const interestAmount = calculateInterest(borrowedAmount, interestRate, 365);
  const totalRepayment = borrowedAmount + interestAmount;
  return totalRepayment;
}

// Find address for post parameters
async function findAddressForParams(userAddress) {
  try {
    const response = await fetch('https://lb-fullnode-alephium.notrustverify.ch/contracts/call-contract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "args": [{
          "value": userAddress,
          "type": "Address"
        }],
        "group": 0,
        "address": "tpxjsWJSaUh5i7XzNAsTWMRtD9QvDTV9zmMNeHHS6jQB",
        "methodIndex": 23
      })
    });
    
    const data = await response.json();
    if (data.type === "CallContractSucceeded" && data.returns && data.returns[0]) {
      // Return the raw hex value from the API response
      return data.returns[0].value;
    }
    throw new Error('Invalid response format');
  } catch (error) {
    console.error('Error finding address for params:', error);
    throw error;
  }
}

// Enhanced fetch collateral function that also fetches borrowed amount
async function fetchCollateralAndBorrowed() {
  const address = document.getElementById('fetchAddress').value.trim();
  const alphInput = document.getElementById('alph');
  const existingBorrowInput = document.getElementById('existingBorrow');
  
  if (!address) {
    showFetchStatus('Please enter an address.', 'error');
    currentAddress = null; // Clear current address
    return;
  }
  
  // Store the address for automatic refresh
  currentAddress = address;
  lastAddressFetchTime = new Date();
  
  showFetchStatus('Fetching collateral and borrowed amount...');
  
  try {
    // Fetch collateral
    const collateralRes = await fetch(`https://corsproxy.io/?https://api.alphbanx.com/api/loan/${address}`);
    if (collateralRes.status === 404) {
      showFetchStatus('Address does not have a loan on AlphBanx.', 'error');
      return;
    }
    if (!collateralRes.ok) throw new Error('Network error');
    const collateralData = await collateralRes.json();
    
    // Get position address
    const contractId = await findAddressForParams(address);
    const positionAddress = addressFromContractId(contractId);
    
    // Fetch borrowed amount using the new API
    const borrowedAmount = await fetchUserBorrowed(address);
    
    // Fetch interest rate using position address
    const interestRate = await fetchInterestRate(positionAddress);
    
    if (typeof collateralData.currentCollateral === 'number') {
      alphInput.value = collateralData.currentCollateral;
      existingBorrowInput.value = borrowedAmount.toFixed(2);
      
      // Calculate and display yearly repayment
      if (borrowedAmount > 0) {
        updateInterestDisplay(interestRate, borrowedAmount);
      }
      
      // Clear status on success - don't show success message
      showFetchStatus('');
      updateCalculator();
    } else {
      showFetchStatus('No collateral found for this address.', 'error');
    }
  } catch (e) {
    showFetchStatus('Could not fetch data. Please check the address or try again later.', 'error');
  }
}

// Update interest display
function updateInterestDisplay(interestRate, totalBorrowed) {
  // Create or update interest display elements
  let interestInfo = document.getElementById('interestInfo');
  if (!interestInfo) {
    interestInfo = document.createElement('div');
    interestInfo.id = 'interestInfo';
    interestInfo.className = 'borrow-info';
    interestInfo.style.marginTop = '16px';
    
    // Insert at the end, before the footer
    const footer = document.querySelector('.footer');
    if (footer) {
      footer.parentNode.insertBefore(interestInfo, footer);
    }
  }
  
  // Calculate interest for different periods
  const dailyInterest = calculateInterest(totalBorrowed, interestRate, 1);
  const monthlyInterest = calculateInterest(totalBorrowed, interestRate, 30);
  const yearlyInterest = calculateInterest(totalBorrowed, interestRate, 365);
  const totalRepayment = totalBorrowed + yearlyInterest;
  
  // Calculate ALPH equivalents
  const dailyAlphEquiv = alphPrice ? (dailyInterest / alphPrice) : 0;
  const monthlyAlphEquiv = alphPrice ? (monthlyInterest / alphPrice) : 0;
  const yearlyAlphEquiv = alphPrice ? (yearlyInterest / alphPrice) : 0;
  
  interestInfo.innerHTML = `
    <div class="result" style="font-size: 1rem; margin-bottom: 12px; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 8px;">
      Interest Rate: ${interestRate.toFixed(2)}% APR
    </div>
    <div class="result" style="font-size: 0.9rem; margin-bottom: 8px;">
      Daily Interest: ${dailyInterest.toFixed(4)} ABD (${dailyAlphEquiv.toFixed(6)} ALPH)
    </div>
    <div class="result" style="font-size: 0.9rem; margin-bottom: 8px;">
      Monthly Interest: ${monthlyInterest.toFixed(2)} ABD (${monthlyAlphEquiv.toFixed(4)} ALPH)
    </div>
    <div class="result" style="font-size: 0.9rem; margin-bottom: 12px;">
      Yearly Interest: ${yearlyInterest.toFixed(2)} ABD (${yearlyAlphEquiv.toFixed(4)} ALPH)
    </div>
    <div class="result" style="font-size: 1rem; color: var(--text); border-top: 1px solid var(--border); padding-top: 8px;">
      Total to repay after 1 year: ${totalRepayment.toFixed(2)} ABD
    </div>
  `;
}

// Automatic refresh for address data
async function autoRefreshAddressData() {
  if (currentAddress && lastAddressFetchTime) {
    const now = new Date();
    const timeSinceLastFetch = now - lastAddressFetchTime;
    
    if (timeSinceLastFetch >= ADDRESS_REFRESH_INTERVAL) {
      // Silently refresh without showing status messages
      const alphInput = document.getElementById('alph');
      const existingBorrowInput = document.getElementById('existingBorrow');
      
      try {
        // Fetch collateral
        const collateralRes = await fetch(`https://corsproxy.io/?https://api.alphbanx.com/api/loan/${currentAddress}`);
        if (collateralRes.ok && collateralRes.status !== 404) {
          const collateralData = await collateralRes.json();
          
          // Get position address
          const contractId = await findAddressForParams(currentAddress);
          const positionAddress = addressFromContractId(contractId);
          
          // Fetch borrowed amount
          const borrowedAmount = await fetchUserBorrowed(currentAddress);
          
          // Fetch interest rate using position address
          const interestRate = await fetchInterestRate(positionAddress);
          
          if (typeof collateralData.currentCollateral === 'number') {
            alphInput.value = collateralData.currentCollateral;
            existingBorrowInput.value = borrowedAmount.toFixed(2);
            
            // Update interest display if there's borrowed amount
            if (borrowedAmount > 0) {
              updateInterestDisplay(interestRate, borrowedAmount);
            }
            
            updateCalculator();
          }
        }
        
        lastAddressFetchTime = now;
      } catch (e) {
        // Silently fail for auto-refresh
        console.log('Auto-refresh failed:', e);
      }
    }
  }
}

function startEditing() {
  const borrowAmount = document.getElementById("borrowAmount");
  const currentValue = parseInt(borrowAmount.textContent) || 0;
  borrowAmount.textContent = currentValue;
  borrowAmount.contentEditable = true;
  borrowAmount.classList.add("editing");
  borrowAmount.focus();

  const range = document.createRange();
  range.selectNodeContents(borrowAmount);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  borrowAmount.addEventListener("keydown", handleKeyPress);
}

function handleKeyPress(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    stopEditing();
  }
  if (
    !/[\d\s\b]/.test(e.key) &&
    !["ArrowLeft", "ArrowRight", "Delete", "Backspace"].includes(e.key)
  ) {
    e.preventDefault();
  }
}

function stopEditing() {
  const borrowAmount = document.getElementById("borrowAmount");
  const slider = document.getElementById("borrowSlider");
  borrowAmount.contentEditable = false;
  borrowAmount.classList.remove("editing");
  let value = parseInt(borrowAmount.textContent) || 0;
  const maxValue = parseInt(slider.max);
  if (value > maxValue) value = maxValue;
  borrowAmount.textContent = value + " ABD";
  slider.value = value;
  borrowAmount.removeEventListener("keydown", handleKeyPress);
  updateCalculator();
}

async function fetchPrice() {
  const icon = document.querySelector(".refresh-icon");
  icon.classList.add("refreshing");
  try {
    const res = await fetch(
      "https://api.diadata.org/v1/assetQuotation/Alephium/tgx7VNFoP9DJiFMFgXXtafQZkUvyEdDHT9ryamHJYrjq"
    );
    const data = await res.json();
    alphPrice = parseFloat(data.Price);
    lastUpdateTime = new Date();
    updatePriceDisplay();
    updateCalculator();
  } catch (err) {
    document.getElementById("price").textContent =
      "Error fetching ALPH price";
  } finally {
    icon.classList.remove("refreshing");
  }
}

function updatePriceDisplay() {
  if (alphPrice !== null && lastUpdateTime !== null) {
    const timeStr = lastUpdateTime.toLocaleTimeString();
    document.getElementById(
      "price"
    ).innerHTML = `Current ALPH Price: $${alphPrice.toFixed(
      4
    )} <span style="font-size: 0.7rem; color: var(--subtext);">(${timeStr})</span>`;
  }
}

function manualRefresh() {
  fetchPrice();
}

function updateFromSlider() {
  const sliderValue = document.getElementById("borrowSlider").value;
  document.getElementById("borrowAmount").textContent =
    sliderValue + " ABD";
  updateCalculator();
}

function updateCalculator() {
  const alph =
    parseFloat(document.getElementById("alph").value) || 0;
  const existingBorrow =
    parseFloat(document.getElementById("existingBorrow").value) || 0;
  const borrowText =
    document.getElementById("borrowAmount").textContent;
  const additionalBorrow = parseFloat(borrowText) || 0;
  const totalBorrowed = existingBorrow + additionalBorrow;

  const collateralValue = document.getElementById("collateralValue");
  const currentRatio = document.getElementById("currentRatio");
  const minRequired = document.getElementById("minRequired");
  const liquidationPrice = document.getElementById("liquidationPrice");
  const safetyMargin = document.getElementById("safetyMargin");
  const maxBorrow = document.getElementById("maxBorrow");
  const totalBorrow = document.getElementById("totalBorrow");
  const slider = document.getElementById("borrowSlider");

  if (alph > 0 && alphPrice !== null) {
    const totalValue = alph * alphPrice;
    const maxBorrowAmount = (totalValue * 100) / MIN_CR;
    const remainingBorrowable = Math.max(
      0,
      maxBorrowAmount - existingBorrow
    );

    maxBorrow.textContent = `Maximum Additional Borrow: ${remainingBorrowable.toFixed(
      2
    )} ABD`;
    slider.max = Math.floor(remainingBorrowable);
    totalBorrow.textContent = `Total Borrowed: ${totalBorrowed.toFixed(
      2
    )} ABD`;

    // Update interest information whenever calculator updates
    if (totalBorrowed > 0) {
      updateInterestDisplay(currentInterestRate, totalBorrowed);
    }

    if (totalBorrowed > 0) {
      const currentCR = (totalValue / totalBorrowed) * 100;
      const liqPrice = (totalBorrowed * MIN_CR) / (alph * 100);
      const priceDrop = ((alphPrice - liqPrice) / alphPrice) * 100;

      collateralValue.textContent = `Collateral Value: $${totalValue.toFixed(
        2
      )}`;
      currentRatio.textContent = `Current Ratio: ${currentCR.toFixed(2)}%`;

      currentRatio.className = "result";
      minRequired.className = "result";

      if (currentCR >= 300) {
        currentRatio.classList.add("safe");
        minRequired.textContent = "Safe: Very healthy collateral ratio";
        minRequired.classList.add("safe");
      } else if (currentCR >= 250) {
        currentRatio.classList.add("safe");
        minRequired.textContent = "Safe: Good collateral ratio";
        minRequired.classList.add("safe");
      } else if (currentCR >= 225) {
        currentRatio.classList.add("caution");
        minRequired.textContent =
          "Caution: Collateral ratio below 250%";
        minRequired.classList.add("caution");
      } else if (currentCR >= MIN_CR) {
        currentRatio.classList.add("warning");
        minRequired.textContent =
          "Warning: Collateral ratio below 225%";
        minRequired.classList.add("warning");
      } else {
        currentRatio.classList.add("warning");
        const minAlphNeeded =
          (totalBorrowed * MIN_CR) / (100 * alphPrice);
        const additionalAlphNeeded = minAlphNeeded - alph;
        minRequired.textContent = `Danger: Need ${additionalAlphNeeded.toFixed(
          2
        )} more ALPH to reach minimum 200%`;
        minRequired.classList.add("warning");
      }

      liquidationPrice.textContent = `Liquidation Price: $${liqPrice.toFixed(
        4
      )}`;

      if (priceDrop > 0) {
        safetyMargin.textContent = `Price can drop ${priceDrop.toFixed(
          2
        )}% before liquidation`;
        safetyMargin.className = "result";
        if (priceDrop >= 25) {
          safetyMargin.classList.add("safe");
        } else if (priceDrop >= 12.5) {
          safetyMargin.classList.add("caution");
        } else {
          safetyMargin.classList.add("warning");
        }
      } else {
        safetyMargin.textContent = "DANGER: Below liquidation price!";
        safetyMargin.className = "result warning";
      }
    } else {
      collateralValue.textContent = `Collateral Value: $${totalValue.toFixed(
        2
      )}`;
      currentRatio.textContent = "";
      minRequired.textContent = "";
      liquidationPrice.textContent = "";
      safetyMargin.textContent = "";
      totalBorrow.textContent = "";
    }
  } else {
    maxBorrow.textContent = "";
    collateralValue.textContent = "";
    currentRatio.textContent = "";
    minRequired.textContent = "";
    liquidationPrice.textContent = "";
    safetyMargin.textContent = "";
    totalBorrow.textContent = "";
  }
}

// Initialize the calculator
fetchPrice();
setInterval(fetchPrice, REFRESH_INTERVAL);
setInterval(autoRefreshAddressData, 10000); // Check every 10 seconds for address refresh 
setInterval(autoRefreshAddressData, 10000); // Check every 10 seconds for address refresh 

// Handle Enter key press in address input
function handleAddressKeydown(event) {
  console.log('Key pressed:', event.key); // Debug logging
  if (event.key === "Enter") {
    event.preventDefault();
    console.log('Enter pressed, fetching data...'); // Debug logging
    updateAddressButtons(); // Update button states
    fetchCollateralAndBorrowed();
  }
}

// Alternative event listener approach
document.addEventListener('DOMContentLoaded', function() {
  const addressInput = document.getElementById('fetchAddress');
  if (addressInput) {
    addressInput.addEventListener('keydown', function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        console.log('Enter pressed via event listener, fetching data...'); // Debug logging
        updateAddressButtons(); // Update button states
        fetchCollateralAndBorrowed();
      }
    });
  }
});

// Update interest display 
// Update interest display 