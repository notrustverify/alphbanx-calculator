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
 *  CALCULATOR LOGIC  *
 ***********************/
let alphPrice = null;
let lastUpdateTime = null;
let lastAddressFetchTime = null;
let currentAddress = null;
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
      const interestRate = parseInt(interestValue); // Convert to percentage
      return interestRate;
    }
    return 0; // Return 0 if no interest rate found
  } catch (error) {
    console.error('Error fetching interest rate:', error);
    return 0; // Return 0 on error
  }
}

// Calculate total amount to reimburse after one year
function calculateYearlyRepayment(borrowedAmount, interestRate) {
  if (borrowedAmount <= 0 || interestRate <= 0) {
    return borrowedAmount;
  }
  
  const interestAmount = (borrowedAmount * interestRate) / 100;
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
  const status = document.getElementById('fetchStatus');
  const alphInput = document.getElementById('alph');
  const existingBorrowInput = document.getElementById('existingBorrow');
  
  if (!address) {
    status.textContent = 'Please enter an address.';
    status.className = 'fetch-status error';
    currentAddress = null; // Clear current address
    return;
  }
  
  // Store the address for automatic refresh
  currentAddress = address;
  lastAddressFetchTime = new Date();
  
  status.textContent = 'Fetching collateral and borrowed amount...';
  status.className = 'fetch-status';
  
  try {
    // Fetch collateral
    const collateralRes = await fetch(`https://corsproxy.io/?https://api.alphbanx.com/api/loan/${address}`);
    if (collateralRes.status === 404) {
      status.textContent = 'Address does not have a loan on AlphBanx.';
      status.className = 'fetch-status error';
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
      if (borrowedAmount > 0 && interestRate > 0) {
        const yearlyRepayment = calculateYearlyRepayment(borrowedAmount, interestRate);
        const interestAmount = yearlyRepayment - borrowedAmount;
        
        // Update the calculator to show interest information
        updateInterestDisplay(interestRate, yearlyRepayment, interestAmount);
      }
      
      // Clear status on success - don't show success message
      status.textContent = '';
      status.className = 'fetch-status';
      updateCalculator();
    } else {
      status.textContent = 'No collateral found for this address.';
      status.className = 'fetch-status error';
    }
  } catch (e) {
    status.textContent = 'Could not fetch data. Please check the address or try again later.';
    status.className = 'fetch-status error';
  }
}

// Update interest display
function updateInterestDisplay(interestRate, yearlyRepayment, interestAmount) {
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
  
  // Calculate ALPH equivalent for interest amount
  const alphEquivalent = alphPrice ? (interestAmount / alphPrice) : 0;
  
  interestInfo.innerHTML = `
    <div class="result" style="font-size: 0.85rem; margin-bottom: 8px; color: var(--primary);">
      Interest Rate: ${interestRate.toFixed(2)}% per year
    </div>
    <div class="result" style="font-size: 1rem;">
      Interest amount: ${interestAmount.toFixed(2)} ABD (${alphEquivalent.toFixed(4)} ALPH)
    </div>
    <div class="result" style="color: var(--subtext); font-size: 0.8rem;">
      Total to repay after 1 year: ${yearlyRepayment.toFixed(2)} ABD
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
            if (borrowedAmount > 0 && interestRate > 0) {
              const yearlyRepayment = calculateYearlyRepayment(borrowedAmount, interestRate);
              const interestAmount = yearlyRepayment - borrowedAmount;
              updateInterestDisplay(interestRate, yearlyRepayment, interestAmount);
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
        fetchCollateralAndBorrowed();
      }
    });
  }
});

// Update interest display 
// Update interest display 