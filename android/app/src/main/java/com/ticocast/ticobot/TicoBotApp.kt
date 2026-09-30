package com.ticocast.ticobot

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.os.Build
import android.provider.OpenableColumns
import android.provider.Settings
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.fragment.app.FragmentActivity
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.delay
import java.io.File
import java.time.LocalDate

private val Emerald = Color(0xFF087F5B)
private val AppColors = lightColorScheme(primary = Emerald, secondary = Color(0xFF0F766E), surface = Color(0xFFF8FAF9), background = Color(0xFFF2F5F3))
private val DarkAppColors = darkColorScheme(
    primary = Color(0xFF38BDF8),
    onPrimary = Color(0xFF00131F),
    primaryContainer = Color(0xFF082F49),
    onPrimaryContainer = Color(0xFFBAE6FD),
    secondary = Color(0xFF22D3EE),
    onSecondary = Color(0xFF001417),
    secondaryContainer = Color(0xFF164E63),
    onSecondaryContainer = Color(0xFFCFFAFE),
    tertiary = Color(0xFF7DD3FC),
    onTertiary = Color(0xFF00131F),
    tertiaryContainer = Color(0xFF0C4A6E),
    onTertiaryContainer = Color(0xFFE0F2FE),
    background = Color(0xFF030609),
    onBackground = Color(0xFFE6F4FA),
    surface = Color(0xFF080D12),
    onSurface = Color(0xFFE6F4FA),
    surfaceContainer = Color(0xFF101820),
    surfaceVariant = Color(0xFF18232D),
    onSurfaceVariant = Color(0xFFB8CAD5),
    outline = Color(0xFF536975),
)
private val ChatEmojis = listOf("😀", "😂", "😊", "😍", "🥳", "😢", "🙏", "👍", "❤️", "✅", "🎉", "📌", "💳", "📄")

enum class AppSection(val label: String) { Home("Inicio"), Clients("Clientes"), Finance("Finanzas"), Chats("Chats"), More("Más") }

@Composable
fun TicoBotApp(viewModel: AppViewModel = viewModel(), pendingChatPhone: String? = null, onPendingChatConsumed: () -> Unit = {}) {
    val state by viewModel.state
    LaunchedEffect(state.chats, pendingChatPhone) {
        if (pendingChatPhone != null) {
            state.chats.firstOrNull { it.phone == pendingChatPhone }?.let { chat ->
                viewModel.openChat(chat)
                onPendingChatConsumed()
            }
        }
    }
    var currentSectionName by rememberSaveable(state.user?.email) { mutableStateOf(AppSection.Home.name) }
    var sectionHistory by rememberSaveable(state.user?.email) { mutableStateOf(listOf<String>()) }
    val currentSection = AppSection.entries.firstOrNull { it.name == currentSectionName } ?: AppSection.Home
    fun navigateTo(target: AppSection) {
        if (target == currentSection) return
        sectionHistory = sectionHistory + currentSection.name
        currentSectionName = target.name
    }
    fun navigateBack(): Boolean {
        val previous = sectionHistory.lastOrNull() ?: return false
        sectionHistory = sectionHistory.dropLast(1)
        currentSectionName = previous
        return true
    }
    val context = LocalContext.current
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        viewModel.setNotificationsEnabled(it)
    }
    var biometricUnlocked by remember(state.token, state.biometricEnabled) { mutableStateOf(!state.biometricEnabled) }
    LaunchedEffect(state.user?.email, state.notificationsEnabled) {
        if (state.user != null && state.notificationsEnabled) {
            if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                viewModel.syncPushToken()
            } else {
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
    MaterialTheme(colorScheme = if (state.darkMode) DarkAppColors else AppColors) {
        Surface(Modifier.fillMaxSize()) {
            if (state.token == null || state.user == null) LoginScreen(state, viewModel)
            else if (!biometricUnlocked) BiometricLockScreen(
                onUnlocked = { biometricUnlocked = true },
                onLogout = viewModel::logout,
            )
            else MainShell(state, viewModel, currentSection, ::navigateTo, ::navigateBack)
        }
    }
}

@Composable
private fun BiometricLockScreen(onUnlocked: () -> Unit, onLogout: () -> Unit) {
    val activity = LocalContext.current as FragmentActivity
    var error by remember { mutableStateOf<String?>(null) }
    fun unlock() = BiometricAuthenticator.authenticate(activity, onUnlocked) { error = it }
    LaunchedEffect(Unit) { unlock() }
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(84.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.Lock, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(42.dp)) }
        Text("TicoBot está protegido", fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 24.dp))
        Text("Usá tu huella o el bloqueo del teléfono para continuar.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp, bottom = 22.dp))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 12.dp)) }
        Button(::unlock, Modifier.fillMaxWidth().height(54.dp)) { Icon(Icons.Default.Lock, null); Spacer(Modifier.width(8.dp)); Text("Desbloquear") }
        TextButton(onLogout) { Text("Cerrar sesión") }
    }
}

@Composable
private fun LoginScreen(state: AppState, vm: AppViewModel) {
    var email by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(68.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(20.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Default.Email, null, tint = Color.White, modifier = Modifier.size(34.dp)) }
        Spacer(Modifier.height(24.dp)); Text("Bienvenido a TicoBot", fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Gestioná tu negocio desde el celular.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp, bottom = 28.dp))
        OutlinedTextField(email, { email = it; vm.clearError() }, Modifier.fillMaxWidth(), label = { Text("Correo electrónico") }, leadingIcon = { Icon(Icons.Default.Email, null) }, singleLine = true, shape = RoundedCornerShape(16.dp))
        Spacer(Modifier.height(14.dp)); OutlinedTextField(password, { password = it; vm.clearError() }, Modifier.fillMaxWidth(), label = { Text("Contraseña") }, leadingIcon = { Icon(Icons.Default.Lock, null) }, visualTransformation = PasswordVisualTransformation(), singleLine = true, shape = RoundedCornerShape(16.dp))
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp)) }
        Button({ vm.login(email, password) }, enabled = !state.loading && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth().padding(top = 18.dp).height(56.dp), shape = RoundedCornerShape(16.dp)) { if (state.loading) CircularProgressIndicator(Modifier.size(22.dp), color = Color.White) else Text("Ingresar", fontWeight = FontWeight.Bold) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(state: AppState, vm: AppViewModel, section: AppSection, navigate: (AppSection) -> Unit, navigateBack: () -> Boolean) {
    LaunchedEffect(Unit) {
        while (true) {
            delay(3_000)
            vm.refreshChats()
        }
    }
    if (state.activeChat != null) { ConversationScreen(state, vm); return }
    BackHandler(enabled = section != AppSection.Home) { navigateBack() }
    Scaffold(
        topBar = { TopAppBar(title = { Text("TicoBot", fontWeight = FontWeight.Bold) }, actions = { IconButton(vm::refresh) { Icon(Icons.Default.Refresh, "Actualizar") } }) },
        bottomBar = { NavigationBar { AppSection.entries.forEach { item -> NavigationBarItem(section == item, { if (item == AppSection.Chats) vm.refreshChats(); navigate(item) }, { Icon(sectionIcon(item), item.label) }, label = { Text(item.label, maxLines = 1) }) } } }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            AnimatedContent(section, label = "Navegación principal") { currentSection ->
                when (currentSection) {
                    AppSection.Home -> HomeScreen(state, navigate)
                    AppSection.Clients -> ClientsScreen(state.clients, state.companies, vm::saveClient, vm::resendClientAccess)
                    AppSection.Finance -> FinanceHub(state, vm)
                    AppSection.Chats -> ChatsScreen(state.chats, vm::openChat, vm::createConversation)
                    AppSection.More -> MoreScreen(state, vm)
                }
            }
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
            state.error?.let { ErrorBanner(it, vm::clearError, Modifier.align(Alignment.BottomCenter)) }
            state.notice?.let { NoticeBanner(it, vm::clearNotice, Modifier.align(Alignment.BottomCenter)) }
        }
    }
}

private fun sectionIcon(section: AppSection) = when (section) { AppSection.Home -> Icons.Default.Home; AppSection.Clients -> Icons.Default.Person; AppSection.Finance -> Icons.Default.Info; AppSection.Chats -> Icons.Default.Email; AppSection.More -> Icons.Default.MoreVert }

@Composable
private fun HomeScreen(state: AppState, navigate: (AppSection) -> Unit) = LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    item { Text("Resumen del negocio", fontSize = 24.sp, fontWeight = FontWeight.Bold) }
    item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { MetricCard("Clientes", state.clients.size, Icons.Default.Person, Modifier.weight(1f)) { navigate(AppSection.Clients) }; MetricCard("Finanzas", state.payments.size, Icons.Default.Info, Modifier.weight(1f)) { navigate(AppSection.Finance) } } }
    item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { MetricCard("Chats", state.chats.size, Icons.Default.Email, Modifier.weight(1f)) { navigate(AppSection.Chats) }; MetricCard("Sin leer", state.chats.sumOf { it.unread }, Icons.Default.Info, Modifier.weight(1f)) { navigate(AppSection.Chats) } } }
    item { Text("Tocá cualquier tarjeta para abrir el módulo", color = MaterialTheme.colorScheme.onSurfaceVariant) }
}

@Composable
private fun MetricCard(label: String, value: Int, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier, onClick: () -> Unit) = Card(onClick, modifier, shape = RoundedCornerShape(20.dp)) { Column(Modifier.padding(18.dp)) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary); Text(value.toString(), fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 14.dp)); Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant) } }

@Composable
private fun ClientsScreen(
    clients: List<ClientItem>,
    companies: List<CompanyItem>,
    save: (ClientItem, () -> Unit) -> Unit,
    resendAccess: (ClientItem) -> Unit,
) {
    var selected by remember { mutableStateOf<ClientItem?>(null) }
    var editing by remember { mutableStateOf<ClientItem?>(null) }
    var creating by remember { mutableStateOf(false) }
    if (editing != null || creating) {
        BackHandler { editing = null; creating = false }
        ClientEditor(editing, companies, { editing = null; creating = false }) { client -> save(client) { editing = null; creating = false; selected = null } }
        return
    }
    if (selected != null) {
        BackHandler { selected = null }
        ClientDetail(selected!!, { selected = null }, { editing = selected }, resendAccess)
        return
    }
    Box(Modifier.fillMaxSize()) {
        SearchList("Buscar clientes", clients, { it.name + it.phone + it.email }) { client -> EntityCard(client.name, client.phone.ifBlank { "Sin teléfono" }, client.status, Icons.Default.Person) { selected = client } }
        FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(18.dp)) { Icon(Icons.Default.Add, "Crear cliente") }
    }
}

@Composable
private fun ContractsScreen(contracts: List<ContractItem>, clients: List<ClientItem>, services: List<ServiceItem>, save: (ContractItem, () -> Unit) -> Unit) {
    var selected by remember { mutableStateOf<ContractItem?>(null) }
    var editing by remember { mutableStateOf<ContractItem?>(null) }
    var creating by remember { mutableStateOf(false) }
    if (editing != null || creating) {
        BackHandler { editing = null; creating = false }
        ContractEditor(editing, clients, services, { editing = null; creating = false }) { contract -> save(contract) { editing = null; creating = false; selected = null } }
        return
    }
    if (selected != null) {
        BackHandler { selected = null }
        ContractDetail(selected!!, { selected = null }) { editing = selected }
        return
    }
    Box(Modifier.fillMaxSize()) {
        SearchList("Buscar contratos", contracts, { it.client + it.status + it.billingCycle }) { contract -> EntityCard(contract.client, "${contract.currency} ${contract.amount}", contract.status, Icons.Default.List) { selected = contract } }
        if (clients.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(18.dp)) { Icon(Icons.Default.Add, "Crear contrato") }
    }
}

@Composable
private fun ClientEditor(existing: ClientItem?, companies: List<CompanyItem>, back: () -> Unit, save: (ClientItem) -> Unit) {
    var name by remember(existing) { mutableStateOf(existing?.name.orEmpty()) }
    var phone by remember(existing) { mutableStateOf(existing?.phone.orEmpty()) }
    var email by remember(existing) { mutableStateOf(existing?.email.orEmpty()) }
    var status by remember(existing) { mutableStateOf(existing?.status ?: "active") }
    var notes by remember(existing) { mutableStateOf(existing?.notes.orEmpty()) }
    var companyId by remember(existing, companies) { mutableStateOf(existing?.companyId?.takeIf { it > 0 } ?: companies.firstOrNull()?.id ?: 0) }
    var companyMenu by remember { mutableStateOf(false) }
    ModulePage(if (existing == null || existing.id == 0L) "Nuevo cliente" else "Editar cliente", back) {
        item {
            if (companies.isNotEmpty()) {
                Text("Empresa *", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Box { OutlinedButton({ companyMenu = true }, Modifier.fillMaxWidth().height(54.dp)) { Text(companies.firstOrNull { it.id == companyId }?.name ?: "Seleccionar empresa", Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, null) }; DropdownMenu(companyMenu, { companyMenu = false }) { companies.forEach { company -> DropdownMenuItem({ Text(company.name) }, { companyId = company.id; companyMenu = false }) } } }
                Spacer(Modifier.height(12.dp))
            }
            OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Nombre *") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text("Teléfono") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Correo") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(status, { status = it }, Modifier.fillMaxWidth(), label = { Text("Estado") }, supportingText = { Text("Ejemplo: active") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(notes, { notes = it }, Modifier.fillMaxWidth(), label = { Text("Notas") }, minLines = 4, maxLines = 8)
            Spacer(Modifier.height(20.dp))
            Button({ save(ClientItem(existing?.id ?: 0, name.trim(), phone.trim(), email.trim(), status.trim(), notes.trim(), existing?.contracts ?: 0, existing?.reminders ?: 0, existing?.payments ?: 0, companyId)) }, Modifier.fillMaxWidth().height(54.dp), enabled = name.isNotBlank() && status.isNotBlank() && (companies.isEmpty() || companyId > 0)) { Icon(Icons.Default.Check, null); Spacer(Modifier.width(8.dp)); Text("Guardar cliente") }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ContractEditor(existing: ContractItem?, clients: List<ClientItem>, services: List<ServiceItem>, back: () -> Unit, save: (ContractItem) -> Unit) {
    var selectedClientId by remember(existing) { mutableStateOf(existing?.clientId ?: clients.firstOrNull()?.id ?: 0) }
    var clientMenuOpen by remember { mutableStateOf(false) }
    var platformMenuOpen by remember { mutableStateOf(false) }
    var selectedServiceIds by remember(existing, services) { mutableStateOf(existing?.serviceIds?.toSet().orEmpty()) }
    var currency by remember(existing) { mutableStateOf(existing?.currency ?: "CRC") }
    var billingCycle by remember(existing) { mutableStateOf(existing?.billingCycle ?: "monthly") }
    var status by remember(existing) { mutableStateOf(existing?.status ?: "active") }
    var nextDueDate by remember(existing) { mutableStateOf(existing?.nextDueDate.orEmpty().take(10)) }
    var graceDays by remember(existing) { mutableStateOf((existing?.graceDays ?: 0).toString()) }
    var notes by remember(existing) { mutableStateOf(existing?.notes.orEmpty()) }
    val selectedClient = clients.firstOrNull { it.id == selectedClientId }
    val companyServices = services.filter { selectedClient?.companyId?.takeIf { id -> id > 0 }?.let { id -> it.companyId == 0L || it.companyId == id } ?: true }
    val selectedServices = companyServices.filter { it.id in selectedServiceIds }
    val calculatedAmount = selectedServices.sumOf { it.price.toDoubleOrNull() ?: 0.0 }
    ModulePage(if (existing == null) "Nuevo contrato" else "Editar contrato", back) {
        item {
            Text("Cliente *", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Box {
                OutlinedButton({ clientMenuOpen = true }, Modifier.fillMaxWidth().height(54.dp)) { Text(selectedClient?.name ?: "Seleccionar cliente", Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, null) }
                DropdownMenu(clientMenuOpen, { clientMenuOpen = false }) { clients.forEach { client -> DropdownMenuItem({ Text(client.name) }, { selectedClientId = client.id; clientMenuOpen = false }) } }
            }
            Spacer(Modifier.height(16.dp)); Text("Plataformas asignadas *", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Box {
                OutlinedButton({ platformMenuOpen = true }, Modifier.fillMaxWidth().height(54.dp)) {
                    Text(if (selectedServices.isEmpty()) "Seleccionar plataformas" else "${selectedServices.size} plataforma${if (selectedServices.size == 1) "" else "s"}", Modifier.weight(1f))
                    Icon(Icons.Default.ArrowDropDown, null)
                }
                DropdownMenu(platformMenuOpen, { platformMenuOpen = false }) {
                    companyServices.filter { it.active || it.id in selectedServiceIds }.forEach { service ->
                        val selected = service.id in selectedServiceIds
                        DropdownMenuItem(
                            text = { Column { Text(service.name, fontWeight = FontWeight.SemiBold); Text("${service.currency} ${service.price}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
                            onClick = { selectedServiceIds = if (selected) selectedServiceIds - service.id else selectedServiceIds + service.id },
                            leadingIcon = { if (selected) Icon(Icons.Default.Check, "Seleccionada", tint = MaterialTheme.colorScheme.primary) else Spacer(Modifier.size(24.dp)) },
                        )
                    }
                }
            }
            if (selectedServices.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                selectedServices.forEach { service -> InputChip(selected = true, onClick = { selectedServiceIds = selectedServiceIds - service.id }, label = { Text(service.name) }, trailingIcon = { Icon(Icons.Default.Close, "Quitar", Modifier.size(16.dp)) }) }
            }
            selectedServices.forEach { service ->
                Card(Modifier.fillMaxWidth().padding(top = 8.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer), shape = RoundedCornerShape(14.dp)) { Column(Modifier.padding(12.dp)) { Text(service.name, fontWeight = FontWeight.SemiBold); if (service.email.isNotBlank()) Text("Cuenta principal: ${service.email}", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary); service.accounts.filter { it.active }.forEach { account -> Text("${account.name.ifBlank { "Cuenta" }}: ${account.identifier}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }; if (service.email.isBlank() && service.accounts.none { it.active }) Text("No hay correos de cuenta registrados", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
            }
            Text("Monto calculado: ${currency} ${"%.2f".format(calculatedAmount)}", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(currency, { currency = it.take(3).uppercase() }, Modifier.fillMaxWidth(), label = { Text("Moneda *") }, supportingText = { Text("CRC o USD") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(billingCycle, { billingCycle = it }, Modifier.fillMaxWidth(), label = { Text("Ciclo de cobro *") }, supportingText = { Text("Ejemplo: monthly") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(status, { status = it }, Modifier.fillMaxWidth(), label = { Text("Estado") }, supportingText = { Text("active, paused o cancelled") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(nextDueDate, { nextDueDate = it }, Modifier.fillMaxWidth(), label = { Text("Próximo vencimiento") }, supportingText = { Text("Formato: AAAA-MM-DD") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(graceDays, { graceDays = it.filter(Char::isDigit).take(2) }, Modifier.fillMaxWidth(), label = { Text("Días de gracia") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(notes, { notes = it }, Modifier.fillMaxWidth(), label = { Text("Notas") }, minLines = 4, maxLines = 8)
            Spacer(Modifier.height(20.dp))
            val valid = selectedClientId > 0 && selectedServiceIds.isNotEmpty() && currency.length == 3 && billingCycle.isNotBlank() && status in listOf("active", "paused", "cancelled")
            Button({ save(ContractItem(existing?.id ?: 0, selectedClientId, selectedClient?.name.orEmpty(), calculatedAmount.toString(), currency, status, billingCycle.trim(), nextDueDate.trim(), graceDays.toIntOrNull() ?: 0, notes.trim(), existing?.reminders ?: 0, existing?.payments ?: 0, selectedServiceIds.toList(), selectedServices.map { it.name })) }, Modifier.fillMaxWidth().height(54.dp), enabled = valid) { Icon(Icons.Default.Check, null); Spacer(Modifier.width(8.dp)); Text("Guardar contrato") }
        }
    }
}

@Composable
private fun ChatsScreen(chats: List<ChatItem>, open: (ChatItem) -> Unit, create: (String, String, () -> Unit) -> Unit) {
    var creating by rememberSaveable { mutableStateOf(false) }
    var showNewMessageLabel by rememberSaveable { mutableStateOf(true) }
    var phone by rememberSaveable { mutableStateOf("") }
    var body by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { delay(4_000); showNewMessageLabel = false }
    Box(Modifier.fillMaxSize()) {
        SearchList("Buscar chats transferidos", chats, { it.name + it.phone }) { ChatRow(it) { open(it) } }
        Box(Modifier.align(Alignment.BottomEnd).padding(18.dp)) {
            AnimatedContent(showNewMessageLabel, label = "Botón nuevo mensaje") { expanded ->
                if (expanded) ExtendedFloatingActionButton(onClick = { creating = true }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Nuevo mensaje") })
                else FloatingActionButton(onClick = { creating = true }) { Icon(Icons.Default.Add, "Nuevo mensaje") }
            }
        }
    }
    if (creating) AlertDialog(
        onDismissRequest = { creating = false },
        title = { Text("Iniciar conversación") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Escribí el número con código de país y el primer mensaje.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(phone, { phone = it.filter(Char::isDigit) }, Modifier.fillMaxWidth(), label = { Text("Teléfono") }, singleLine = true)
                OutlinedTextField(body, { body = it }, Modifier.fillMaxWidth(), label = { Text("Mensaje") }, minLines = 3, maxLines = 6)
            }
        },
        confirmButton = { TextButton({ create(phone, body) { creating = false; phone = ""; body = "" } }, enabled = phone.length >= 8 && body.isNotBlank()) { Text("Enviar") } },
        dismissButton = { TextButton({ creating = false }) { Text("Cancelar") } },
    )
}

@Composable
private fun <T> SearchList(placeholder: String, entries: List<T>, searchable: (T) -> String, row: @Composable (T) -> Unit) { var query by remember { mutableStateOf("") }; val visible = remember(entries, query) { entries.filter { searchable(it).contains(query, true) } }; Column(Modifier.fillMaxSize()) { OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 16.dp), placeholder = { Text(placeholder) }, leadingIcon = { Icon(Icons.Default.Search, null) }, shape = RoundedCornerShape(18.dp), singleLine = true); if (visible.isEmpty()) EmptyState("No encontramos resultados") else LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { itemsIndexed(visible) { index, entry -> AnimatedListEntry(index) { row(entry) } } } } }

@Composable
private fun AnimatedListEntry(index: Int, content: @Composable () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { delay((index.coerceAtMost(8) * 35).toLong()); visible = true }
    AnimatedVisibility(visible, enter = fadeIn() + slideInVertically { it / 3 }) { content() }
}

@Composable
private fun EntityCard(title: String, subtitle: String, status: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) = Card(onClick, Modifier.fillMaxWidth().animateContentSize(), shape = RoundedCornerShape(18.dp)) { Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(title, icon); Column(Modifier.weight(1f).padding(horizontal = 14.dp)) { Text(title, fontWeight = FontWeight.SemiBold, maxLines = 1); Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }; Text(status, fontSize = 12.sp, color = MaterialTheme.colorScheme.primary); Icon(Icons.Default.ArrowForward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) } }

@Composable
private fun ClientDetail(
    client: ClientItem,
    back: () -> Unit,
    edit: () -> Unit,
    resendAccess: (ClientItem) -> Unit,
) {
    var confirmResend by remember(client.id) { mutableStateOf(false) }

    DetailPage("Cliente", client.name, back) {
        Button(edit, Modifier.fillMaxWidth()) { Icon(Icons.Default.Edit, null); Spacer(Modifier.width(8.dp)); Text("Editar cliente") }
        OutlinedButton(
            onClick = { confirmResend = true },
            modifier = Modifier.fillMaxWidth(),
            enabled = client.phone.isNotBlank() && client.contracts > 0,
        ) {
            Icon(Icons.Default.Send, null)
            Spacer(Modifier.width(8.dp))
            Text("Reenviar accesos")
        }
        if (client.phone.isBlank()) Text("Agregá un teléfono al cliente para poder enviarle sus accesos.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
        DetailLine(Icons.Default.Info, "Teléfono", client.phone.ifBlank { "Sin teléfono" })
        DetailLine(Icons.Default.Email, "Correo", client.email.ifBlank { "Sin correo" })
        DetailLine(Icons.Default.Info, "Estado", client.status)
        DetailLine(Icons.Default.List, "Contratos", client.contracts.toString())
        DetailLine(Icons.Default.Info, "Pagos", client.payments.toString())
        DetailLine(Icons.Default.Info, "Recordatorios", client.reminders.toString())
        if (client.notes.isNotBlank()) DetailLine(Icons.Default.Info, "Notas", client.notes)
    }

    if (confirmResend) AlertDialog(
        onDismissRequest = { confirmResend = false },
        title = { Text("Reenviar accesos") },
        text = { Text("Se enviarán por WhatsApp los accesos de todos los contratos al día de ${client.name}.") },
        confirmButton = {
            Button({
                confirmResend = false
                resendAccess(client)
            }) { Text("Reenviar") }
        },
        dismissButton = { TextButton({ confirmResend = false }) { Text("Cancelar") } },
    )
}

@Composable
private fun ContractDetail(contract: ContractItem, back: () -> Unit, edit: () -> Unit) = DetailPage("Contrato", contract.client, back) { Button(edit, Modifier.fillMaxWidth()) { Icon(Icons.Default.Edit, null); Spacer(Modifier.width(8.dp)); Text("Editar plataformas") }; DetailLine(Icons.Default.List, "Plataformas", contract.serviceNames.joinToString().ifBlank { "Sin plataformas" }); DetailLine(Icons.Default.Info, "Monto calculado", "${contract.currency} ${contract.amount}"); DetailLine(Icons.Default.Info, "Estado", contract.status); DetailLine(Icons.Default.Info, "Ciclo de cobro", contract.billingCycle.ifBlank { "No definido" }); DetailLine(Icons.Default.Info, "Próximo vencimiento", contract.nextDueDate.ifBlank { "No definido" }); DetailLine(Icons.Default.Info, "Días de gracia", contract.graceDays.toString()); DetailLine(Icons.Default.Info, "Pagos", contract.payments.toString()); DetailLine(Icons.Default.Info, "Recordatorios", contract.reminders.toString()); DetailLine(Icons.Default.Info, "Número", contract.id.toString()); if (contract.notes.isNotBlank()) DetailLine(Icons.Default.Info, "Notas", contract.notes) }

@Composable
private fun DetailPage(label: String, title: String, back: () -> Unit, content: @Composable ColumnScope.() -> Unit) = LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { item { TextButton(back) { Icon(Icons.Default.ArrowBack, null); Text("Volver") } }; item { Text(label, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp)); Text(title, fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 12.dp)) }; item { Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp)) { Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp), content = content) } } }

@Composable
private fun DetailLine(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String) = Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(44.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary) }; Column(Modifier.weight(1f).padding(start = 14.dp)) { Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, fontWeight = FontWeight.SemiBold, fontSize = 16.sp) } }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationScreen(state: AppState, vm: AppViewModel) {
    val activePhone = state.activeChat?.phone.orEmpty()
    val lookupDigits = activePhone.filter(Char::isDigit)
    val existingClient = state.clients.firstOrNull { client ->
        val clientDigits = client.phone.filter(Char::isDigit)
        clientDigits.isNotBlank() && lookupDigits.isNotBlank() && (clientDigits == lookupDigits || clientDigits.endsWith(lookupDigits.takeLast(8)) || lookupDigits.endsWith(clientDigits.takeLast(8)))
    }
    var creatingClient by remember(activePhone) { mutableStateOf(false) }
    var viewingClient by remember(activePhone) { mutableStateOf(false) }
    var editingClient by remember(activePhone) { mutableStateOf(false) }

    if (editingClient && existingClient != null) {
        BackHandler { editingClient = false }
        ClientEditor(existingClient, state.companies, { editingClient = false }) { client -> vm.saveClient(client) { editingClient = false; viewingClient = false } }
        return
    }

    if (viewingClient && existingClient != null) {
        BackHandler { viewingClient = false }
        ClientDetail(existingClient, { viewingClient = false }, { editingClient = true }, vm::resendClientAccess)
        return
    }

    if (creatingClient) {
        BackHandler { creatingClient = false }
        ClientEditor(
            ClientItem(0, "", activePhone, "", "active", "Cliente creado desde una conversación de WhatsApp.", 0, 0, 0),
            state.companies,
            { creatingClient = false },
        ) { client -> vm.saveClient(client) { creatingClient = false } }
        return
    }

    BackHandler { vm.closeChat() }
    val context = LocalContext.current
    var draft by remember { mutableStateOf("") }
    var photo by remember { mutableStateOf<PhotoAttachment?>(null) }
    var showQuickReplies by remember { mutableStateOf(false) }
    var chatMenuExpanded by remember { mutableStateOf(false) }
    val messageFocusRequester = remember(activePhone) { FocusRequester() }
    var showEmojis by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var addingQuickReply by remember { mutableStateOf(false) }
    var quickTitle by remember { mutableStateOf("") }
    var quickBody by remember { mutableStateOf("") }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            if (bytes != null && bytes.size <= 10 * 1024 * 1024) {
                var filename = "imagen.jpg"
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) filename = cursor.getString(0) ?: filename
                }
                photo = PhotoAttachment(filename, context.contentResolver.getType(uri) ?: "image/jpeg", Base64.encodeToString(bytes, Base64.NO_WRAP))
            }
        }
    }
    val listState = rememberLazyListState()
    LaunchedEffect(state.activeChat?.phone) {
        while (state.activeChat != null) {
            delay(2_000)
            vm.refreshActiveChat()
        }
    }
    LaunchedEffect(state.activeChat?.phone, state.messages.size) {
        if (state.messages.isNotEmpty()) listState.scrollToItem(state.messages.lastIndex)
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Column { Text(state.activeChat?.name.orEmpty(), fontWeight = FontWeight.Bold); Text(state.activeChat?.phone.orEmpty(), fontSize = 12.sp) } },
                navigationIcon = { IconButton(vm::closeChat) { Icon(Icons.Default.ArrowBack, "Volver") } },
                actions = {
                    Box {
                        IconButton({ chatMenuExpanded = true }) { Icon(Icons.Default.MoreVert, "Acciones de conversación") }
                        DropdownMenu(expanded = chatMenuExpanded, onDismissRequest = { chatMenuExpanded = false }) {
                            DropdownMenuItem(
                                text = { Text("Responder") },
                                leadingIcon = { Icon(Icons.Default.Send, null) },
                                onClick = { chatMenuExpanded = false; messageFocusRequester.requestFocus() },
                            )
                            DropdownMenuItem(
                                text = { Text("Actualizar") },
                                leadingIcon = { Icon(Icons.Default.Refresh, null) },
                                onClick = { chatMenuExpanded = false; vm.refreshActiveChat() },
                            )
                            DropdownMenuItem(
                                text = { Text(if (existingClient == null) "Crear cliente" else "Ver cliente") },
                                leadingIcon = { Icon(if (existingClient == null) Icons.Default.Add else Icons.Default.Person, null) },
                                onClick = { chatMenuExpanded = false; if (existingClient == null) creatingClient = true else viewingClient = true },
                            )
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text("Eliminar chat", color = MaterialTheme.colorScheme.error) },
                                leadingIcon = { Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error) },
                                onClick = { chatMenuExpanded = false; confirmDelete = true },
                            )
                        }
                    }
                },
            )
        },
        bottomBar = {
            Column(Modifier.navigationBarsPadding().padding(horizontal = 10.dp, vertical = 8.dp)) {
                photo?.let { attachment ->
                    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Add, null, tint = MaterialTheme.colorScheme.primary); Text(attachment.filename, Modifier.weight(1f).padding(horizontal = 10.dp), maxLines = 1, overflow = TextOverflow.Ellipsis); IconButton({ photo = null }) { Icon(Icons.Default.Close, "Quitar foto") } }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton({ photoPicker.launch("image/*") }, enabled = !state.loading, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.Add, "Adjuntar foto", tint = MaterialTheme.colorScheme.primary) }
                    IconButton({ showQuickReplies = true }, enabled = !state.loading, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.Edit, "Respuestas rápidas", tint = MaterialTheme.colorScheme.primary) }
                    IconButton({ showEmojis = true }, enabled = !state.loading, modifier = Modifier.size(48.dp)) { Text("😊", fontSize = 22.sp) }
                    OutlinedTextField(draft, { draft = it }, Modifier.weight(1f).focusRequester(messageFocusRequester), placeholder = { Text(if (photo == null) "Mensaje" else "Descripción opcional") }, shape = RoundedCornerShape(24.dp), maxLines = 4)
                    Spacer(Modifier.width(8.dp))
                    FilledIconButton({
                        val selectedPhoto = photo
                        if (selectedPhoto != null) vm.sendPhoto(draft, selectedPhoto) { draft = ""; photo = null }
                        else vm.sendMessage(draft) { draft = "" }
                    }, enabled = (draft.isNotBlank() || photo != null) && !state.loading, modifier = Modifier.size(52.dp)) { Icon(Icons.Default.Send, "Enviar") }
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                Card(
                        onClick = { if (existingClient == null) creatingClient = true else viewingClient = true },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    ) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Person, null, tint = MaterialTheme.colorScheme.primary)
                            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                Text(if (existingClient == null) "Crear cliente desde este chat" else "Cliente ya asociado", fontWeight = FontWeight.Bold)
                                Text(existingClient?.name ?: activePhone, fontSize = 12.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
                            }
                            Icon(if (existingClient == null) Icons.Default.Add else Icons.Default.ArrowForward, if (existingClient == null) "Crear cliente" else "Ver cliente", tint = MaterialTheme.colorScheme.primary)
                        }
                }
                LazyColumn(Modifier.fillMaxWidth().weight(1f), state = listState, contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state.messages.isEmpty() && !state.loading) item { Text("No hay mensajes", Modifier.fillMaxWidth().padding(24.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    items(state.messages) { MessageBubble(it) }
                }
            }
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            state.error?.let { ErrorBanner(it, vm::clearError, Modifier.align(Alignment.BottomCenter)) }
        }
    }

    if (showQuickReplies) AlertDialog(
        onDismissRequest = { showQuickReplies = false },
        title = { Text("Respuestas rápidas") },
        text = {
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 430.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.quickReplies) { reply ->
                    Card(onClick = { draft = reply.body; showQuickReplies = false }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) { Text(reply.title, fontWeight = FontWeight.Bold); Text(reply.body, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
                item { OutlinedButton({ showQuickReplies = false; addingQuickReply = true }, Modifier.fillMaxWidth()) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("Agregar respuesta") } }
            }
        },
        confirmButton = { TextButton({ showQuickReplies = false }) { Text("Cerrar") } },
    )
    if (showEmojis) AlertDialog(
        onDismissRequest = { showEmojis = false },
        title = { Text("Elegir emoji") },
        text = { Column { ChatEmojis.chunked(5).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { row.forEach { emoji -> TextButton({ draft += emoji; showEmojis = false }, modifier = Modifier.size(52.dp)) { Text(emoji, fontSize = 26.sp) } } } } } },
        confirmButton = { TextButton({ showEmojis = false }) { Text("Cerrar") } },
    )
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Eliminar conversación") },
        text = { Text("Se borrará el historial de este chat. El cliente, sus contratos y pagos se conservarán.") },
        confirmButton = { TextButton({ confirmDelete = false; vm.deleteActiveChat {} }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Eliminar") } },
        dismissButton = { TextButton({ confirmDelete = false }) { Text("Cancelar") } },
    )
    if (addingQuickReply) AlertDialog(
        onDismissRequest = { addingQuickReply = false },
        title = { Text("Nueva respuesta rápida") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { OutlinedTextField(quickTitle, { quickTitle = it }, Modifier.fillMaxWidth(), label = { Text("Nombre") }, singleLine = true); OutlinedTextField(quickBody, { quickBody = it }, Modifier.fillMaxWidth(), label = { Text("Mensaje") }, minLines = 4, maxLines = 8) } },
        confirmButton = { TextButton({ vm.addQuickReply(quickTitle, quickBody) { addingQuickReply = false; quickTitle = ""; quickBody = "" } }, enabled = quickTitle.isNotBlank() && quickBody.isNotBlank() && !state.loading) { Text("Guardar") } },
        dismissButton = { TextButton({ addingQuickReply = false }) { Text("Cancelar") } },
    )
}

@Composable
private fun MessageBubble(message: ChatMessageItem) {
    val outbound = message.direction == "outbound"
    val bitmap = remember(message.id, message.mediaData) { if (message.mediaKind == "image") decodeChatImage(message.mediaData) else null }
    var expanded by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (outbound) Arrangement.End else Arrangement.Start) {
        Surface(color = if (outbound) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(18.dp), tonalElevation = 1.dp, modifier = Modifier.widthIn(max = 310.dp)) {
            Column(Modifier.padding(if (bitmap != null) 5.dp else 12.dp)) {
                bitmap?.let {
                    Image(it.asImageBitmap(), "Imagen del chat", Modifier.fillMaxWidth().heightIn(min = 150.dp, max = 300.dp).clickable { expanded = true }, contentScale = ContentScale.Crop)
                }
                if (message.mediaKind == "audio" && message.mediaData.isNotBlank()) AudioMessagePlayer(message)
                if (message.body.isNotBlank()) Text(message.body, color = if (outbound) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(if (bitmap != null) 8.dp else 0.dp))
                if (bitmap == null && message.mediaKind != "audio" && message.body.isBlank()) Text("Adjunto", color = if (outbound) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                Row(
                    Modifier.align(Alignment.End).padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(message.sentAt.substringAfter("T", message.sentAt).take(5), fontSize = 10.sp, color = if (outbound) MaterialTheme.colorScheme.onPrimary.copy(alpha = .72f) else MaterialTheme.colorScheme.onSurfaceVariant)
                    if (outbound) {
                        Spacer(Modifier.width(4.dp))
                        Text(
                            when (message.status) {
                                "read" -> "✓✓"
                                "delivered" -> "✓✓"
                                "sent" -> "✓"
                                "queued" -> "◷"
                                "failed" -> "!"
                                else -> "✓"
                            },
                            fontSize = 11.sp,
                            color = when (message.status) { "read" -> Color(0xFF53BDEB); "failed" -> Color(0xFFFFB4AB); else -> MaterialTheme.colorScheme.onPrimary.copy(alpha = .78f) },
                        )
                    }
                }
                if (outbound && message.status in listOf("failed", "delivered", "read")) Text(
                    when (message.status) { "failed" -> "No entregado"; "read" -> "Leído"; else -> "Entregado" },
                    fontSize = 10.sp,
                    color = if (message.status == "failed") Color(0xFFFFB4AB) else MaterialTheme.colorScheme.onPrimary.copy(alpha = .72f),
                    modifier = Modifier.align(Alignment.End).padding(horizontal = 8.dp),
                )
            }
        }
    }
    if (expanded && bitmap != null) Dialog(onDismissRequest = { expanded = false }) {
        Surface(color = Color.Black, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth().clickable { expanded = false }) {
            Image(bitmap.asImageBitmap(), "Imagen ampliada", Modifier.fillMaxWidth().heightIn(min = 280.dp, max = 650.dp), contentScale = ContentScale.Fit)
        }
    }
}



@Composable
private fun AudioMessagePlayer(message: ChatMessageItem) {
    val context = LocalContext.current
    var player by remember(message.id) { mutableStateOf<MediaPlayer?>(null) }; var prepared by remember(message.id) { mutableStateOf(false) }; var playing by remember(message.id) { mutableStateOf(false) }; var failed by remember(message.id) { mutableStateOf(false) }; var progress by remember(message.id) { mutableFloatStateOf(0f) }
    val audioFile = remember(message.id, message.mediaData) { runCatching { File(context.cacheDir, "chat-audio-" + message.id).apply { writeBytes(Base64.decode(message.mediaData.substringAfter("base64,", message.mediaData), Base64.DEFAULT)) } }.getOrNull() }
    DisposableEffect(audioFile) {
        val mediaPlayer = audioFile?.let { file -> runCatching { MediaPlayer().apply { setDataSource(file.absolutePath); setOnPreparedListener { prepared = true }; setOnCompletionListener { playing = false; progress = 0f; seekTo(0) }; setOnErrorListener { _, _, _ -> failed = true; playing = false; true }; prepareAsync() } }.getOrElse { failed = true; null } }; player = mediaPlayer
        onDispose { mediaPlayer?.release(); audioFile?.delete() }
    }
    LaunchedEffect(playing, player) { while (playing) { player?.takeIf { it.duration > 0 }?.let { progress = it.currentPosition.toFloat() / it.duration }; delay(200) } }
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.widthIn(min = 230.dp)) {
        IconButton(onClick = { player?.let { if (it.isPlaying) { it.pause(); playing = false } else { it.start(); playing = true } } }, enabled = prepared && !failed) { Icon(if (playing) Icons.Default.Close else Icons.Default.PlayArrow, if (playing) "Pausar audio" else "Reproducir audio") }
        Column(Modifier.weight(1f)) { Slider(value = progress, onValueChange = { value -> progress = value; player?.let { media -> if (media.duration > 0) media.seekTo((media.duration * value).toInt()) } }, enabled = prepared && !failed); Text(if (failed) "No se pudo reproducir el audio" else if (prepared) "Mensaje de voz" else "Cargando audio…", fontSize = 11.sp) }
    }
}

private fun decodeChatImage(encoded: String): android.graphics.Bitmap? {
    if (encoded.isBlank()) return null
    return runCatching {
        val clean = encoded.substringAfter("base64,", encoded)
        val bytes = Base64.decode(clean, Base64.DEFAULT)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (bounds.outWidth / sample > 1200 || bounds.outHeight / sample > 1200) sample *= 2
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
    }.getOrNull()
}

@Composable
private fun ChatRow(chat: ChatItem, onClick: () -> Unit) = Card(onClick, Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) { Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(chat.name, Icons.Default.Person); Column(Modifier.weight(1f).padding(horizontal = 14.dp)) { Text(chat.name, fontWeight = FontWeight.Bold, maxLines = 1); Text(chat.preview, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) }; if (chat.unread > 0) Badge { Text(chat.unread.toString()) }; Icon(Icons.Default.ArrowForward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) } }

@Composable
private fun Avatar(name: String, icon: androidx.compose.ui.graphics.vector.ImageVector) = Box(Modifier.size(48.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) { if (name.isNotBlank()) Text(name.take(1).uppercase(), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold) else Icon(icon, null, tint = MaterialTheme.colorScheme.primary) }

@Composable
private fun FinanceHub(state: AppState, vm: AppViewModel) {
    var module by remember { mutableStateOf<String?>(null) }
    if (module != null) {
        BackHandler { module = null }
        when (module) {
            "Resumen" -> AccountingModule(state, vm) { module = null }
            "Pagos" -> PaymentsModule(state, vm) { module = null }
            "Conciliaciones" -> ConciliationsModule(state, vm) { module = null }
            "Cobranzas" -> CollectionsModule(state, vm) { module = null }
            "Morosidad" -> DelinquenciesModule(state, vm) { module = null }
            "Indicadores" -> AccountingIndicatorsModule(state, vm) { module = null }
            "Correos SINPE" -> SinpeEmailsModule(state, vm) { module = null }
        }
        return
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Centro financiero", fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Text("Pagos, cobros, conciliaciones e indicadores", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item { MenuTileRow(listOf(MenuEntry("Resumen", "Cartera y movimientos", Icons.Default.Info), MenuEntry("Pagos", "Revisión y comprobantes", Icons.Default.CheckCircle)), onOpen = { module = it }) }
        item { MenuTileRow(listOf(MenuEntry("Conciliaciones", "Revisar y aprobar pagos", Icons.Default.CheckCircle)), onOpen = { module = it }) }
        item { MenuTileRow(listOf(MenuEntry("Cobranzas", "Próximos y vencidos", Icons.Default.Notifications), MenuEntry("Morosidad", "Seguimiento por período", Icons.Default.Warning)), onOpen = { module = it }) }
        item { MenuTileRow(listOf(MenuEntry("Indicadores", "Ingresos, costos y utilidad", Icons.Default.Info), MenuEntry("Correos SINPE", "Conciliar movimientos", Icons.Default.Email)), onOpen = { module = it }) }
        state.finance?.let { finance ->
            item { Text("Resumen de ${finance.period}", fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
            item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { FinanceAmountCard("Conciliado", finance.verified, "${finance.verifiedCount} pagos", Modifier.weight(1f)); FinanceAmountCard("Por cobrar", finance.pending, "Hasta fin de mes", Modifier.weight(1f)) } }
        }
    }
}

@Composable
private fun MoreScreen(state: AppState, vm: AppViewModel) {
    var module by remember { mutableStateOf<String?>(null) }
    if (module != null) {
        BackHandler { module = null }
        when (module) {
            "Contratos" -> ContractsScreen(state.contracts, state.clients, state.services, vm::saveContract)
            "Recordatorios" -> RemindersModule(state, vm) { module = null }
            "Pagos" -> PaymentsModule(state, vm) { module = null }
            "Conciliaciones" -> ConciliationsModule(state, vm) { module = null }
            "Cobranzas" -> CollectionsModule(state, vm) { module = null }
            "Clientes morosos" -> DelinquenciesModule(state, vm) { module = null }
            "Contabilidad" -> AccountingModule(state, vm) { module = null }
            "Indicadores" -> AccountingIndicatorsModule(state, vm) { module = null }
            "Correos SINPE" -> SinpeEmailsModule(state, vm) { module = null }
            "Configuración" -> SettingsModule(state, vm) { module = null }
            "Sistema" -> SystemSettingsModule(state, vm) { module = null }
            "Perfil" -> ProfileModule(state, vm) { module = null }
            "Usuarios" -> UsersModule(state.users, vm::updateUserRole) { module = null }
            "Servicios" -> ServicesModule(state, vm) { module = null }
            "Empresas" -> CompaniesModule(state, vm) { module = null }
        }
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Herramientas", fontSize = 26.sp, fontWeight = FontWeight.Bold); Text("Todo el negocio, organizado para el celular", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (state.user?.isAdmin == true) item {
            Card(onClick = { module = "Clientes morosos" }, modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer), shape = RoundedCornerShape(22.dp)) { Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(48.dp).background(MaterialTheme.colorScheme.error.copy(alpha=.12f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.Warning, null, tint = MaterialTheme.colorScheme.error) }; Column(Modifier.weight(1f).padding(horizontal = 14.dp)) { Text("Clientes morosos", fontWeight = FontWeight.Bold, fontSize = 18.sp); Text("${state.delinquencies.size} clientes requieren seguimiento", color = MaterialTheme.colorScheme.onErrorContainer, fontSize = 13.sp) }; Icon(Icons.Default.ArrowForward, null) } }
        }
        item { MenuGroupTitle("Finanzas y cobros") }
        item { MenuTileRow(listOf(MenuEntry("Contabilidad", "Resumen y aplicar pagos", Icons.Default.Info), MenuEntry("Pagos", "Revisión y comprobantes", Icons.Default.CheckCircle)), onOpen = { module = it }) }
        item { MenuTileRow(listOf(MenuEntry("Conciliaciones", "Revisar y aprobar pagos", Icons.Default.CheckCircle)), onOpen = { module = it }) }
        item { MenuTileRow(listOf(MenuEntry("Cobranzas", "Avisos próximos y vencidos", Icons.Default.Notifications), MenuEntry("Indicadores", "Ingresos, costos y utilidad", Icons.Default.Info)), onOpen = { module = it }) }
        item { MenuGroupTitle("Comunicación") }
        item { MenuTileRow(listOf(MenuEntry("Recordatorios", "Crear, enviar y reintentar", Icons.Default.Send), MenuEntry("Correos SINPE", "Movimientos recibidos", Icons.Default.Email)), onOpen = { module = it }) }
        if (state.user?.isAdmin == true) {
            item { MenuGroupTitle("Administración") }
            item { MenuTileRow(listOf(MenuEntry("Contratos", "Servicios y vencimientos", Icons.Default.List), MenuEntry("Servicios", "Cuentas, precios y accesos", Icons.Default.List)), onOpen = { module = it }) }
            item { MenuTileRow(listOf(MenuEntry("Empresas", "Datos, cuentas y estado", Icons.Default.Person)), onOpen = { module = it }) }
            item { MenuTileRow(listOf(MenuEntry("Usuarios", "Roles y permisos", Icons.Default.Person), MenuEntry("Sistema", "Empresa y mensajes", Icons.Default.Settings)), onOpen = { module = it }) }
            item { MenuTileRow(listOf(MenuEntry("Configuración", "Preferencias de la app", Icons.Default.Settings)), onOpen = { module = it }) }
        } else item { MenuTileRow(listOf(MenuEntry("Configuración", "Preferencias de la app", Icons.Default.Settings)), onOpen = { module = it }) }
        item { MenuGroupTitle("Mi cuenta") }
        item { EntityCard(state.user?.name.orEmpty(), state.user?.email.orEmpty(), "Abrir perfil", Icons.Default.Person) { module = "Perfil" } }
        item { OutlinedButton(vm::logout, Modifier.fillMaxWidth().height(54.dp)) { Icon(Icons.Default.ArrowBack, null); Spacer(Modifier.width(8.dp)); Text("Cerrar sesión") } }
    }
}

private data class MenuEntry(val label: String, val description: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)
@Composable private fun MenuGroupTitle(title: String) = Text(title.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp, start = 2.dp))
@Composable
private fun MenuTileRow(entries: List<MenuEntry>, onOpen: (String) -> Unit) = Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
    entries.forEach { entry ->
        Card(onClick = { onOpen(entry.label) }, modifier = Modifier.weight(1f).height(142.dp), shape = RoundedCornerShape(20.dp)) {
            Column(Modifier.fillMaxSize().padding(16.dp)) {
                Box(Modifier.size(40.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Icon(entry.icon, null, tint = MaterialTheme.colorScheme.primary) }
                Text(entry.label, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
                Text(entry.description, fontSize = 11.sp, lineHeight = 14.sp, maxLines = 2, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    if (entries.size == 1) Spacer(Modifier.weight(1f))
}

@Composable
private fun SinpeEmailsModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var selected by remember { mutableStateOf<SinpeEmailItem?>(null) }; var query by remember { mutableStateOf("") }; var status by remember { mutableStateOf("pending") }
    if (selected != null) { BackHandler { selected = null }; SinpeEmailDetail(selected!!, state, vm) { selected = null }; return }
    val visible = state.sinpeEmails.filter { item -> (status == "all" || item.status == status) && (query.isBlank() || listOf(item.originName, item.originPhone, item.reference, item.motive).any { it.contains(query, true) }) }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(back) { Icon(Icons.Default.ArrowBack, "Volver") }; Text("Correos SINPE", Modifier.weight(1f), fontSize = 22.sp, fontWeight = FontWeight.Bold); IconButton(vm::syncSinpeEmails) { Icon(Icons.Default.Refresh, "Sincronizar correos") } }
        OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = 12.dp), label = { Text("Buscar nombre, referencia o motivo") }, leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true)
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("pending" to "Pendientes", "in_review" to "En revisión", "all" to "Todos").forEach { (value, label) -> FilterChip(selected = status == value, onClick = { status = value }, label = { Text(label) }) } }
        if (visible.isEmpty()) EmptyState("No hay correos SINPE con este filtro") else LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { items(visible) { item -> Card(onClick = { vm.markSinpeEmailRead(item); selected = item }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { Text(item.originName.ifBlank { "Origen desconocido" }, Modifier.weight(1f), fontWeight = if (item.isRead) FontWeight.SemiBold else FontWeight.Bold); Text("₡${item.amount}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary) }
            Text(item.motive.ifBlank { item.subject }, maxLines = 2, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) { AssistChip(onClick = {}, label = { Text(item.status) }); if (!item.isRead) Badge { Text("Nuevo") }; Text(item.performedAt.take(10), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } } } }
    }
}

@Composable
private fun SinpeEmailDetail(item: SinpeEmailItem, state: AppState, vm: AppViewModel, back: () -> Unit) {
    var selectedContract by remember(item.id) { mutableStateOf<ContractItem?>(null) }; var contractMenu by remember { mutableStateOf(false) }; var billingMonth by remember { mutableStateOf(LocalDate.now().toString().take(7)) }; var months by remember { mutableStateOf("1") }; var confirmDelete by remember { mutableStateOf(false) }
    val available = state.contracts.filter { it.status == "active" }.sortedByDescending { clientMatchScore(item.originName, it.client) }
    DetailPage("Correo SINPE", item.originName.ifBlank { "Origen desconocido" }, back) {
        DetailLine(Icons.Default.Info, "Monto", "CRC ${item.amount}"); DetailLine(Icons.Default.Info, "Referencia", item.reference.ifBlank { "Sin referencia" }); DetailLine(Icons.Default.Person, "Teléfono origen", item.originPhone.ifBlank { "No indicado" }); DetailLine(Icons.Default.Info, "Motivo", item.motive.ifBlank { "No indicado" }); DetailLine(Icons.Default.Info, "Fecha", item.performedAt.take(16).replace("T", " ")); DetailLine(Icons.Default.Info, "Estado", item.status)
        if (item.client.isNotBlank()) DetailLine(Icons.Default.Person, "Cliente aplicado", item.client); if (item.contract.isNotBlank()) DetailLine(Icons.Default.List, "Contrato aplicado", item.contract)
        if (item.status !in listOf("in_review", "conciliated")) {
            Text("Aplicar transacción", fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
            Box { OutlinedButton({ contractMenu = true }, Modifier.fillMaxWidth().height(54.dp)) { Text(selectedContract?.let { "${it.client} · ${it.currency} ${it.amount}" } ?: "Seleccionar cliente y contrato", Modifier.weight(1f), maxLines = 1); Icon(Icons.Default.ArrowDropDown, null) }; DropdownMenu(contractMenu, { contractMenu = false }) { available.forEach { contract -> DropdownMenuItem(text = { Column { Text(contract.client, fontWeight = FontWeight.SemiBold); Text(contract.serviceNames.joinToString().ifBlank { "${contract.currency} ${contract.amount}" }, fontSize = 12.sp) } }, onClick = { selectedContract = contract; contractMenu = false }) } } }
            OutlinedTextField(billingMonth, { billingMonth = it.take(7) }, Modifier.fillMaxWidth(), label = { Text("Primer mes cubierto") }, supportingText = { Text("AAAA-MM") }, singleLine = true)
            OutlinedTextField(months, { months = it.filter(Char::isDigit).take(2) }, Modifier.fillMaxWidth(), label = { Text("Cantidad de meses") }, singleLine = true)
            val valid = selectedContract != null && Regex("\\d{4}-\\d{2}").matches(billingMonth) && (months.toIntOrNull() ?: 0) in 1..36
            Button({ selectedContract?.let { vm.conciliateSinpeEmail(item, it, billingMonth, months.toInt(), back) } }, Modifier.fillMaxWidth().height(54.dp), enabled = valid && !state.loading) { Icon(Icons.Default.Check, null); Spacer(Modifier.width(8.dp)); Text("Enviar pago a revisión") }
        }
        if (item.conciliationId > 0 && item.conciliationStatus in listOf("pending", "in_review")) {
            Text("Revisar conciliación", fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
            Button({ vm.reviewSinpeConciliation(item, true, back) }, Modifier.fillMaxWidth().height(54.dp), enabled = !state.loading) { Icon(Icons.Default.Check, null); Spacer(Modifier.width(8.dp)); Text("Aprobar conciliación") }
            OutlinedButton({ vm.reviewSinpeConciliation(item, false, back) }, Modifier.fillMaxWidth().height(54.dp), enabled = !state.loading, colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Icon(Icons.Default.Close, null); Spacer(Modifier.width(8.dp)); Text("Rechazar conciliación") }
        }
        OutlinedButton({ confirmDelete = true }, Modifier.fillMaxWidth(), colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Icon(Icons.Default.Delete, null); Spacer(Modifier.width(8.dp)); Text("Eliminar correo") }
    }
    if (confirmDelete) AlertDialog(onDismissRequest = { confirmDelete = false }, title = { Text("Eliminar correo") }, text = { Text("Se eliminará tanto de TicoBot como del buzón de correo.") }, confirmButton = { TextButton({ confirmDelete = false; vm.deleteSinpeEmail(item); back() }) { Text("Eliminar") } }, dismissButton = { TextButton({ confirmDelete = false }) { Text("Cancelar") } })
}

private fun clientMatchScore(origin: String, client: String): Int { val left = origin.lowercase().split(Regex("\\W+")).filter { it.isNotBlank() }.toSet(); val right = client.lowercase().split(Regex("\\W+")).filter { it.isNotBlank() }; return when { origin.equals(client, true) -> 1000; right.isNotEmpty() && right.all { it in left } -> 500; else -> right.count { it in left } * 100 } }
@Composable
private fun CompaniesModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var editing by remember { mutableStateOf<CompanyItem?>(null) }
    var creating by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<CompanyItem?>(null) }
    if (editing != null || creating) {
        CompanyEditor(editing, { editing = null; creating = false }) { company -> vm.saveCompany(company) { editing = null; creating = false } }
        return
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(back) { Icon(Icons.Default.ArrowBack, "Volver") }; Text("Empresas", Modifier.weight(1f), fontSize = 22.sp, fontWeight = FontWeight.Bold); IconButton({ creating = true }) { Icon(Icons.Default.Add, "Crear empresa") } }
        if (state.companies.isEmpty()) EmptyState("No hay empresas configuradas") else LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(state.companies, key = { it.id }) { company -> Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(16.dp)) {
                Row { Text(company.name, Modifier.weight(1f), fontWeight = FontWeight.Bold); AssistChip(onClick = {}, label = { Text(if (company.active) "Activa" else "Inactiva") }) }
                if (company.slug.isNotBlank()) Text(company.slug, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (company.paymentContact.isNotBlank()) Text("SINPE: ${company.paymentContact}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row { TextButton({ editing = company }) { Text("Editar") }; TextButton({ deleting = company }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Eliminar") } }
            } } }
        }
    }
    deleting?.let { company -> AlertDialog(onDismissRequest = { deleting = null }, title = { Text("Eliminar empresa") }, text = { Text("Solo se puede eliminar si no tiene clientes ni servicios asociados.") }, confirmButton = { TextButton({ deleting = null; vm.deleteCompany(company) }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Eliminar") } }, dismissButton = { TextButton({ deleting = null }) { Text("Cancelar") } }) }
}

@Composable
private fun CompanyEditor(existing: CompanyItem?, back: () -> Unit, save: (CompanyItem) -> Unit) {
    var name by remember(existing) { mutableStateOf(existing?.name.orEmpty()) }
    var slug by remember(existing) { mutableStateOf(existing?.slug.orEmpty()) }
    var paymentContact by remember(existing) { mutableStateOf(existing?.paymentContact.orEmpty()) }
    var beneficiary by remember(existing) { mutableStateOf(existing?.beneficiaryName.orEmpty()) }
    var accounts by remember(existing) { mutableStateOf(existing?.bankAccounts.orEmpty()) }
    var active by remember(existing) { mutableStateOf(existing?.active ?: true) }
    ModulePage(if (existing == null) "Nueva empresa" else "Editar empresa", back) { item {
        OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Nombre *") }, singleLine = true)
        Spacer(Modifier.height(12.dp)); OutlinedTextField(slug, { slug = it.lowercase().replace(" ", "-") }, Modifier.fillMaxWidth(), label = { Text("Identificador") }, singleLine = true)
        Spacer(Modifier.height(12.dp)); OutlinedTextField(paymentContact, { paymentContact = it }, Modifier.fillMaxWidth(), label = { Text("Número SINPE") }, singleLine = true)
        Spacer(Modifier.height(12.dp)); OutlinedTextField(beneficiary, { beneficiary = it }, Modifier.fillMaxWidth(), label = { Text("Beneficiario") }, singleLine = true)
        Spacer(Modifier.height(12.dp)); OutlinedTextField(accounts, { accounts = it }, Modifier.fillMaxWidth(), label = { Text("Cuentas bancarias") }, minLines = 3)
        Spacer(Modifier.height(12.dp)); Row(verticalAlignment = Alignment.CenterVertically) { Switch(active, { active = it }); Text("Empresa activa", Modifier.padding(start = 10.dp)) }
        Spacer(Modifier.height(18.dp)); Button({ save(CompanyItem(existing?.id ?: 0, name.trim(), slug.trim(), paymentContact.trim(), beneficiary.trim(), accounts.trim(), active)) }, Modifier.fillMaxWidth(), enabled = name.isNotBlank()) { Text("Guardar empresa") }
    } }
}

@Composable
private fun ServicesModule(state:AppState,vm:AppViewModel,back:()->Unit){var edit by remember{mutableStateOf<ServiceItem?>(null)};var creating by remember{mutableStateOf(false)};var accountFor by remember{mutableStateOf<ServiceItem?>(null)}
 if(edit!=null||creating){ServiceEditor(edit,back={edit=null;creating=false}){vm.saveService(it){edit=null;creating=false}};return}
 Column(Modifier.fillMaxSize()){Row(Modifier.padding(12.dp),verticalAlignment=Alignment.CenterVertically){IconButton(back){Icon(Icons.Default.ArrowBack,"Volver")};Text("Servicios y cuentas",Modifier.weight(1f),fontSize=22.sp,fontWeight=FontWeight.Bold);IconButton({creating=true}){Icon(Icons.Default.Add,"Agregar")}}
 LazyColumn(contentPadding=PaddingValues(12.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){items(state.services){s->Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp)){Column(Modifier.padding(16.dp)){Row{Text(s.name,Modifier.weight(1f),fontWeight=FontWeight.Bold);Text("${s.currency} ${s.price}")};Text("Costo ${s.cost} · día ${s.paymentDay.takeIf{it>0}?:"—"} · ${if(s.active)"Activo" else "Inactivo"}",color=MaterialTheme.colorScheme.onSurfaceVariant);if(s.email.isNotBlank())Text("${s.email} · PIN ${s.pin.ifBlank{"—"}}",fontSize=12.sp);s.accounts.forEach{a->Row(verticalAlignment=Alignment.CenterVertically){Text("${a.name.ifBlank{"Cuenta"}}: ${a.identifier}",Modifier.weight(1f),fontSize=12.sp);IconButton({vm.deleteServiceAccount(a)}){Icon(Icons.Default.Delete,"Eliminar cuenta")}}};Row{TextButton({edit=s}){Text("Editar")};TextButton({accountFor=s}){Text("Agregar cuenta")};TextButton({vm.deleteService(s)}){Text("Eliminar")}}}}}}}
 accountFor?.let{s->ServiceAccountDialog(s,{accountFor=null}){name,id,pass->vm.addServiceAccount(s,name,id,pass){accountFor=null}}}}
@Composable private fun ServiceEditor(old:ServiceItem?,back:()->Unit,save:(ServiceItem)->Unit){var name by remember{mutableStateOf(old?.name.orEmpty())};var price by remember{mutableStateOf(old?.price?:"0")};var cost by remember{mutableStateOf(old?.cost?:"0")};var currency by remember{mutableStateOf(old?.currency?:"CRC")};var email by remember{mutableStateOf(old?.email.orEmpty())};var password by remember{mutableStateOf(old?.password.orEmpty())};var pin by remember{mutableStateOf(old?.pin.orEmpty())};var day by remember{mutableStateOf((old?.paymentDay?:0).toString())};var profiles by remember{mutableStateOf((old?.maxProfiles?:0).toString())};var active by remember{mutableStateOf(old?.active?:true)}
 ModulePage(if(old==null)"Nuevo servicio" else "Editar servicio",back){item{OutlinedTextField(name,{name=it},Modifier.fillMaxWidth(),label={Text("Nombre")});OutlinedTextField(price,{price=it},Modifier.fillMaxWidth(),label={Text("Precio")});OutlinedTextField(cost,{cost=it},Modifier.fillMaxWidth(),label={Text("Costo")});OutlinedTextField(currency,{currency=it.uppercase().take(3)},Modifier.fillMaxWidth(),label={Text("Moneda")});OutlinedTextField(day,{day=it.filter(Char::isDigit).take(2)},Modifier.fillMaxWidth(),label={Text("Día de pago")});OutlinedTextField(email,{email=it},Modifier.fillMaxWidth(),label={Text("Correo de cuenta")});OutlinedTextField(password,{password=it},Modifier.fillMaxWidth(),label={Text("Contraseña")});OutlinedTextField(pin,{pin=it},Modifier.fillMaxWidth(),label={Text("PIN")});OutlinedTextField(profiles,{profiles=it.filter(Char::isDigit)},Modifier.fillMaxWidth(),label={Text("Máximo de perfiles")});Row(verticalAlignment=Alignment.CenterVertically){Switch(active,{active=it});Text("Servicio activo")};Button({save(ServiceItem(old?.id?:0,name,price,currency,active,cost,day.toIntOrNull()?:0,email,password,pin,profiles.toIntOrNull()?:0,old?.accounts.orEmpty()))},Modifier.fillMaxWidth(),enabled=name.isNotBlank()&&price.toDoubleOrNull()!=null&&currency in listOf("CRC","USD")){Text("Guardar servicio")}}}}
@Composable private fun ServiceAccountDialog(service:ServiceItem,close:()->Unit,save:(String,String,String)->Unit){var name by remember{mutableStateOf("")};var id by remember{mutableStateOf("")};var pass by remember{mutableStateOf("")};AlertDialog(onDismissRequest=close,title={Text("Cuenta para ${service.name}")},text={Column{OutlinedTextField(name,{name=it},label={Text("Nombre")});OutlinedTextField(id,{id=it},label={Text("Correo o identificador")});OutlinedTextField(pass,{pass=it},label={Text("Contraseña")})}},confirmButton={TextButton({save(name,id,pass)},enabled=id.isNotBlank()){Text("Agregar")}},dismissButton={TextButton(close){Text("Cancelar")}})}
@Composable
private fun ConciliationsModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var filter by remember { mutableStateOf("in_review") }
    var query by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<ConciliationItem?>(null) }
    val rows = state.conciliations.filter { item ->
        (filter == "all" || item.status == filter) &&
            (query.isBlank() || listOf(item.client, item.contract, item.reference).any { it.contains(query, true) })
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(back) { Icon(Icons.Default.ArrowBack, "Volver") }
            Text("Conciliaciones", Modifier.weight(1f), fontSize = 22.sp, fontWeight = FontWeight.Bold)
            IconButton(vm::refresh) { Icon(Icons.Default.Refresh, "Actualizar") }
        }
        OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = 12.dp), label = { Text("Cliente, contrato o referencia") }, leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true)
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("in_review" to "En revisión", "pending" to "Pendientes", "approved" to "Aprobadas", "all" to "Todas").forEach { (value, label) ->
                FilterChip(filter == value, { filter = value }, { Text(label) })
            }
        }
        if (rows.isEmpty()) EmptyState("No hay conciliaciones con este filtro") else LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(rows, key = { it.id }) { item ->
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Row { Text("#${item.id} · ${item.client}", Modifier.weight(1f), fontWeight = FontWeight.Bold); Text("${item.currency} ${item.amount}", fontWeight = FontWeight.Bold) }
                        Text(item.contract.ifBlank { "Sin contrato" }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (item.reference.isNotBlank()) Text("Ref. ${item.reference}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        AssistChip(onClick = {}, label = { Text(item.status) }, modifier = Modifier.padding(top = 8.dp))
                        if (item.notes.isNotBlank()) Text(item.notes, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                        if (item.status in listOf("pending", "in_review")) Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button({ vm.reviewConciliation(item, true) }, Modifier.weight(1f), enabled = !state.loading) { Text("Aprobar") }
                            OutlinedButton({ vm.reviewConciliation(item, false) }, Modifier.weight(1f), enabled = !state.loading) { Text("Rechazar") }
                        }
                        TextButton({ pendingDelete = item }, enabled = !state.loading, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Icon(Icons.Default.Delete, null); Spacer(Modifier.width(4.dp)); Text("Eliminar conciliación") }
                    }
                }
            }
        }
    }
    pendingDelete?.let { item -> AlertDialog(onDismissRequest = { pendingDelete = null }, title = { Text("Eliminar conciliación") }, text = { Text("Se revertirá la conciliación del pago #${item.paymentId}. Esta acción no se puede deshacer.") }, confirmButton = { TextButton({ pendingDelete = null; vm.deleteConciliation(item) }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Eliminar") } }, dismissButton = { TextButton({ pendingDelete = null }) { Text("Cancelar") } }) }
}

@Composable
private fun PaymentsModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var status by remember { mutableStateOf("in_review") }; var query by remember { mutableStateOf("") }; var receiptPayment by remember { mutableStateOf<PaymentItem?>(null) }; var applyingPayment by remember { mutableStateOf(false) }
    if (applyingPayment) { BackHandler { applyingPayment = false }; PaymentEditor(state, vm) { applyingPayment = false }; return }
    val context=LocalContext.current
    val receiptPicker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->uri?.let{val bytes=context.contentResolver.openInputStream(it)?.use{stream->stream.readBytes()}?:return@let;var name="comprobante.pdf";context.contentResolver.query(it,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{c->if(c.moveToFirst())name=c.getString(0)};receiptPayment?.let{p->vm.attachPaymentReceipt(p,PhotoAttachment(name,context.contentResolver.getType(it)?:"application/pdf",Base64.encodeToString(bytes,Base64.NO_WRAP)))}}}
    val rows = state.payments.filter { (status == "all" || it.status == status) && (query.isBlank() || (it.client + it.reference + it.contract).contains(query, true)) }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(back) { Icon(Icons.Default.ArrowBack, "Volver") }; Text("Pagos", Modifier.weight(1f), fontSize = 22.sp, fontWeight = FontWeight.Bold); IconButton({ applyingPayment = true }) { Icon(Icons.Default.Add, "Aplicar pago") } }
        Button({ applyingPayment = true }, Modifier.fillMaxWidth().padding(horizontal = 12.dp).height(52.dp)) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("Aplicar pago") }
        OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = 12.dp), label = { Text("Cliente o referencia") }, leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true)
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("in_review" to "En revisión", "verified" to "Verificados", "all" to "Todos").forEach { (value,label) -> FilterChip(status == value, { status = value }, { Text(label) }) } }
        if (rows.isEmpty()) EmptyState("No hay pagos con este filtro") else LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { items(rows) { payment -> Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(16.dp)) {
            Row { Text("#${payment.id} · ${payment.client}", Modifier.weight(1f), fontWeight = FontWeight.Bold); Text("${payment.currency} ${payment.amount}", fontWeight = FontWeight.Bold) }
            Text("${payment.contract.ifBlank { "Sin contrato" }} · ${payment.reference.ifBlank { "Sin referencia" }}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(payment.status, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(vertical = 8.dp))
            TextButton({receiptPayment=payment;vm.loadPaymentReceipts(payment.id)}){Text("Ver comprobantes")}; Button({receiptPayment=payment;receiptPicker.launch("application/pdf")}){Text("Adjuntar PDF")}; if(receiptPayment?.id==payment.id) state.paymentReceipts.forEach{Text("• ${it.name} (${it.size/1024} KB)",fontSize=12.sp)}
            if (payment.status !in listOf("verified", "rejected")) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Button({ vm.reviewPayment(payment, true) }, Modifier.weight(1f), enabled = !state.loading) { Text("Aprobar") }; OutlinedButton({ vm.reviewPayment(payment, false) }, Modifier.weight(1f), enabled = !state.loading) { Text("Rechazar") } }
        } } } }
    }
}

@Composable
private fun CollectionsModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var category by remember { mutableStateOf("Todos") }; var confirm by remember { mutableStateOf<CollectionItem?>(null) }
    val rows = state.collections.filter { category == "Todos" || it.category == category }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(back) { Icon(Icons.Default.ArrowBack, "Volver") }; Text("Cobranzas", Modifier.weight(1f), fontSize = 22.sp, fontWeight = FontWeight.Bold); IconButton(vm::refresh) { Icon(Icons.Default.Refresh, "Actualizar") } }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) { listOf("Todos", "Vencido", "Vence hoy", "Próximo").forEach { label -> FilterChip(category == label, { category = label }, { Text(label) }) } }
        if (rows.isEmpty()) EmptyState("No hay cobros en esta ventana") else LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { items(rows) { item -> Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(16.dp)) {
            Row { Text(item.client, Modifier.weight(1f), fontWeight = FontWeight.Bold); Text("${item.currency} ${item.amount}", fontWeight = FontWeight.Bold) }
            Text("${item.contract} · vence ${item.dueDate}", color = MaterialTheme.colorScheme.onSurfaceVariant); AssistChip(onClick = {}, label = { Text(item.category) })
            Button({ confirm = item }, Modifier.fillMaxWidth(), enabled = item.phone.isNotBlank() && !state.loading) { Icon(Icons.Default.Send, null); Spacer(Modifier.width(8.dp)); Text("Enviar aviso") }
        } } } }
    }
    confirm?.let { item -> AlertDialog(onDismissRequest = { confirm = null }, title = { Text("Enviar aviso de cobro") }, text = { Text("¿Enviar por WhatsApp el aviso a ${item.client}?") }, confirmButton = { TextButton({ confirm = null; vm.sendCollectionNotice(item) }) { Text("Enviar") } }, dismissButton = { TextButton({ confirm = null }) { Text("Cancelar") } }) }
}

@Composable
private fun DelinquenciesModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var query by remember { mutableStateOf("") }
    var expandedClient by remember { mutableStateOf<Long?>(null) }
    var archive by remember { mutableStateOf<DelinquencyPeriod?>(null) }
    var resend by remember { mutableStateOf<DelinquencyPeriod?>(null) }
    val rows = state.delinquencies.filter { query.isBlank() || listOf(it.name, it.phone, it.email).any { value -> value.contains(query, true) } }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(back) { Icon(Icons.Default.ArrowBack, "Volver") }; Column(Modifier.weight(1f)) { Text("Clientes morosos", fontSize = 22.sp, fontWeight = FontWeight.Bold); Text("Recordatorio enviado sin pago verificado", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }; IconButton(vm::refresh) { Icon(Icons.Default.Refresh, "Actualizar") } }
        OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = 12.dp), label = { Text("Buscar cliente") }, leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true)
        if (rows.isEmpty()) EmptyState("No hay clientes morosos") else LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { items(rows, key = { it.id }) { client ->
            Card(onClick = { expandedClient = if (expandedClient == client.id) null else client.id }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(client.name, fontWeight = FontWeight.Bold); Text(client.phone.ifBlank { client.email }, color = MaterialTheme.colorScheme.onSurfaceVariant) }; Badge(containerColor = MaterialTheme.colorScheme.error) { Text(client.periods.size.toString()) } }
                Text("Moroso desde ${crDate(client.oldestDueDate)} · ${client.remindersSent} recordatorios", color = MaterialTheme.colorScheme.error, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
                if (expandedClient == client.id) client.periods.forEach { period -> HorizontalDivider(Modifier.padding(vertical = 10.dp)); Text(period.contract.ifBlank { "Contrato" }, fontWeight = FontWeight.SemiBold); if (period.services.isNotBlank()) Text(period.services, fontSize = 12.sp); Text("Mes ${crMonth(period.period)} · venció ${crDate(period.dueDate)}", color = MaterialTheme.colorScheme.onSurfaceVariant); Text("${period.currency} ${"%.2f".format(period.amount)}", fontWeight = FontWeight.Bold); if (period.resent) Text("Recordatorio reenviado${period.lastResendAt.takeIf(String::isNotBlank)?.let { " · ${crDateTime(it)}" }.orEmpty()}", color = MaterialTheme.colorScheme.primary, fontSize = 12.sp); Row { TextButton({ resend = period }, enabled = !state.loading) { Icon(Icons.Default.Send, null); Spacer(Modifier.width(4.dp)); Text(if (period.resent) "Reenviar otra vez" else "Reenviar") }; TextButton({ archive = period }, enabled = !state.loading, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Icon(Icons.Default.Delete, null); Spacer(Modifier.width(4.dp)); Text("Archivar mes") } } }
            } }
        } }
    }
    resend?.let { period -> AlertDialog(onDismissRequest = { resend = null }, title = { Text("Reenviar recordatorio") }, text = { Text("Se reenviará este mes y el cliente seguirá visible como moroso hasta verificar el pago o archivar el período.") }, confirmButton = { TextButton({ resend = null; vm.resendDelinquency(period) }) { Text("Reenviar") } }, dismissButton = { TextButton({ resend = null }) { Text("Cancelar") } }) }
    archive?.let { period -> AlertDialog(onDismissRequest = { archive = null }, title = { Text("Archivar solo este mes") }, text = { Text("Se archivará ${crMonth(period.period)} en el contrato. Los demás meses morosos permanecerán visibles.") }, confirmButton = { TextButton({ archive = null; vm.dismissDelinquency(period) }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Archivar mes") } }, dismissButton = { TextButton({ archive = null }) { Text("Cancelar") } }) }
}

private fun crDate(value: String): String = runCatching { java.time.LocalDate.parse(value.take(10)).format(java.time.format.DateTimeFormatter.ofPattern("dd-MM-yyyy")) }.getOrDefault(value.take(10).ifBlank { "—" })
private fun crMonth(value: String): String = runCatching { java.time.YearMonth.parse(value.take(7)).format(java.time.format.DateTimeFormatter.ofPattern("MM-yyyy")) }.getOrDefault(value.ifBlank { "—" })
private fun crDateTime(value: String): String = crDate(value) + value.drop(10).take(6).replace("T", " ")
@Composable
private fun RemindersModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var editing by remember { mutableStateOf<ReminderItem?>(null) }; var creating by remember { mutableStateOf(false) }; var filter by remember { mutableStateOf("pending") }
    if (creating || editing != null) { BackHandler { creating=false; editing=null }; ReminderEditor(editing, state.contracts, { creating=false; editing=null }) { item,message -> vm.saveReminder(item,message) { creating=false; editing=null } }; return }
    val rows=state.reminders.filter { filter=="all" || it.status==filter }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment=Alignment.CenterVertically) { IconButton(back){Icon(Icons.Default.ArrowBack,"Volver")}; Text("Recordatorios",Modifier.weight(1f),fontSize=22.sp,fontWeight=FontWeight.Bold); IconButton({creating=true}){Icon(Icons.Default.Add,"Crear")} }
        Row(Modifier.padding(horizontal=12.dp), horizontalArrangement=Arrangement.spacedBy(6.dp)){ listOf("pending" to "Pendientes","failed" to "Fallidos","sent" to "Enviados","all" to "Todos").forEach{(v,l)->FilterChip(filter==v,{filter=v},{Text(l)})} }
        if(rows.isEmpty()) EmptyState("No hay recordatorios") else LazyColumn(contentPadding=PaddingValues(12.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){items(rows){r->Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp)){Column(Modifier.padding(16.dp)){Text(r.client,fontWeight=FontWeight.Bold);Text("${r.contract} · ${r.scheduledFor.take(16).replace("T"," ")}",color=MaterialTheme.colorScheme.onSurfaceVariant);Text(r.status,color=MaterialTheme.colorScheme.primary);Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){TextButton({editing=r}){Text("Editar")};if(r.status=="failed")TextButton({vm.retryReminder(r)}){Text("Reintentar")};if(r.status in listOf("pending","failed"))TextButton({vm.sendReminder(r)}){Text("Enviar")};TextButton({vm.deleteReminder(r)}){Text("Eliminar")}}}}}}
    }
}

@Composable
private fun ReminderEditor(existing: ReminderItem?, contracts: List<ContractItem>, back:()->Unit, save:(ReminderItem,String)->Unit) {
    var contract by remember { mutableStateOf(contracts.firstOrNull{it.id==existing?.contractId} ?: contracts.firstOrNull()) }; var menu by remember{mutableStateOf(false)}; var date by remember{mutableStateOf(existing?.scheduledFor?.take(16) ?: LocalDate.now().toString()+"T09:00")};var channel by remember{mutableStateOf(existing?.channel ?: "whatsapp")};var recurrence by remember{mutableStateOf(existing?.recurrence.ifNullOrBlank{"monthly"} ?: "monthly")};var message by remember{mutableStateOf("")}
    ModulePage(if(existing==null)"Nuevo recordatorio" else "Editar recordatorio",back){item{Box{OutlinedButton({menu=true},Modifier.fillMaxWidth()){Text(contract?.let{"${it.client} · ${it.serviceNames.joinToString()}"}?:"Seleccionar contrato",Modifier.weight(1f));Icon(Icons.Default.ArrowDropDown,null)};DropdownMenu(menu,{menu=false}){contracts.filter{it.status=="active"}.forEach{c->DropdownMenuItem({Text("${c.client} · ${c.serviceNames.joinToString()}")},{contract=c;menu=false})}}};Spacer(Modifier.height(10.dp));OutlinedTextField(date,{date=it.take(16)},Modifier.fillMaxWidth(),label={Text("Fecha y hora")},supportingText={Text("AAAA-MM-DDTHH:MM")});OutlinedTextField(channel,{channel=it},Modifier.fillMaxWidth(),label={Text("Canal")});OutlinedTextField(recurrence,{recurrence=it},Modifier.fillMaxWidth(),label={Text("Recurrencia")},supportingText={Text("weekly, biweekly, monthly u one_time")});OutlinedTextField(message,{message=it},Modifier.fillMaxWidth(),label={Text("Mensaje personalizado (opcional)")},minLines=3);Spacer(Modifier.height(14.dp));val valid=contract!=null&&date.length==16&&channel.isNotBlank();Button({contract?.let{c->save(ReminderItem(existing?.id?:0,c.client,"pending",channel,date,c.clientId,c.id,c.serviceNames.joinToString(),recurrence),message)}},Modifier.fillMaxWidth(),enabled=valid){Text("Guardar recordatorio")}}}
}
private fun String?.ifNullOrBlank(default:()->String)=if(this.isNullOrBlank())default() else this
@Composable private fun AccountingIndicatorsModule(state:AppState,vm:AppViewModel,back:()->Unit){var month by remember{mutableStateOf(LocalDate.now().toString().take(7))};LaunchedEffect(month){vm.loadAccountingIndicators(month)};ModulePage("Indicadores",back){item{OutlinedTextField(month,{month=it.take(7)},Modifier.fillMaxWidth(),label={Text("Mes")},supportingText={Text("AAAA-MM")})};if(state.accountingIndicators.isEmpty())item{EmptyState("No hay movimientos por servicio")}else items(state.accountingIndicators){row->Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp)){Column(Modifier.padding(16.dp)){Text(row.name,fontWeight=FontWeight.Bold);Text("Ingresos: ${row.currency} ${row.revenue}");Text("Costo: ${row.currency} ${row.cost}");Text("Ganancia: ${row.currency} ${row.profit}",color=if(row.profit>=0)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,fontWeight=FontWeight.Bold)}}}}}
@Composable
private fun AccountingModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var applyingPayment by remember { mutableStateOf(false) }
    if (applyingPayment) { BackHandler { applyingPayment = false }; PaymentEditor(state, vm) { applyingPayment = false }; return }
    ModulePage("Contabilidad", back) {
        val finance = state.finance
        if (finance == null) item { EmptyState("No se pudo cargar la información financiera") } else {
            item { Button({ applyingPayment = true }, Modifier.fillMaxWidth().height(54.dp)) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("Aplicar pago") } }
            item { Text("Centro financiero · ${finance.period}", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold) }
            item { FinanceAmountCard("Cartera activa total", finance.contracted, "${crc(finance.future)} vence después de este mes") }
            item { FinanceAmountCard("Conciliado este mes", finance.verified, "${finance.verifiedCount} pagos verificados") }
            item { FinanceAmountCard("Por cobrar hasta fin de mes", finance.pending, "${crc(finance.dueThisMonth)} vence este mes") }
            item { FinanceAmountCard("Por revisar", finance.inReview, "${finance.reviewCount} movimientos requieren atención") }
            item { Text("Movimientos recientes", fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
            items(state.payments.take(20)) { payment -> EntityCard(payment.client, "${payment.currency} ${payment.amount} · ${payment.channel}", payment.status, Icons.Default.Info) {} }
        }
    }
}

@Composable
private fun PaymentEditor(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var clientQuery by remember { mutableStateOf("") }
    var selectedClient by remember { mutableStateOf<ClientItem?>(null) }
    var clientMenuExpanded by remember { mutableStateOf(false) }
    val filteredClients = remember(clientQuery, state.clients) {
        val q = clientQuery.trim()
        if (q.isBlank()) state.clients.take(50) else state.clients.filter { it.name.contains(q, true) || it.phone.contains(q, true) }.take(50)
    }
    val clientContracts = remember(selectedClient?.id, state.contracts) { state.contracts.filter { it.clientId == selectedClient?.id && it.status == "active" } }
    var selectedContract by remember(selectedClient?.id) { mutableStateOf<ContractItem?>(null) }
    var contractMenuExpanded by remember { mutableStateOf(false) }
    var amount by remember(selectedContract?.id) { mutableStateOf(selectedContract?.amount.orEmpty()) }
    var currency by remember(selectedContract?.id) { mutableStateOf(selectedContract?.currency ?: "CRC") }
    var channel by remember { mutableStateOf("sinpe") }; var reference by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("verified") }
    var paidAt by remember { mutableStateOf(LocalDate.now().toString()) }; var billingMonth by remember { mutableStateOf(LocalDate.now().toString().take(7)) }; var months by remember { mutableStateOf("1") }; var graceMonths by remember { mutableStateOf("0") }
    val monthlyCoverage = contractSupportsMonthlyCoverage(selectedContract)
    ModulePage("Aplicar pago", back) { item {
        Text("Cliente *", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box {
            OutlinedTextField(
                value = selectedClient?.let { "${it.name} (${it.phone})" } ?: clientQuery,
                onValueChange = { clientQuery = it; selectedClient = null; clientMenuExpanded = true },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Buscar por nombre o teléfono") },
                trailingIcon = { if (selectedClient != null) IconButton({ selectedClient = null; clientQuery = "" }) { Icon(Icons.Default.Close, "Limpiar cliente") } else Icon(Icons.Default.Search, null) },
                singleLine = true,
            )
            DropdownMenu(clientMenuExpanded && selectedClient == null, { clientMenuExpanded = false }) {
                if (filteredClients.isEmpty()) DropdownMenuItem(text = { Text("Sin resultados") }, onClick = {}, enabled = false)
                filteredClients.forEach { c -> DropdownMenuItem(text = { Text("${c.name} (${c.phone})") }, onClick = { selectedClient = c; selectedContract = null; clientQuery = ""; clientMenuExpanded = false }) }
            }
        }
        Spacer(Modifier.height(12.dp)); Text("Contrato (opcional)", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box {
            OutlinedButton({ contractMenuExpanded = true }, Modifier.fillMaxWidth().height(54.dp), enabled = selectedClient != null) { Text(selectedContract?.let { it.serviceNames.joinToString().ifBlank { "${it.currency} ${it.amount}" } } ?: "Sin contrato asociado", Modifier.weight(1f), maxLines = 1); Icon(Icons.Default.ArrowDropDown, null) }
            DropdownMenu(contractMenuExpanded, { contractMenuExpanded = false }) {
                DropdownMenuItem(text = { Text("Sin contrato asociado") }, onClick = { selectedContract = null; contractMenuExpanded = false })
                clientContracts.forEach { contract -> DropdownMenuItem(text = { Column { Text(contract.serviceNames.joinToString().ifBlank { "Contrato #${contract.id}" }); Text("${contract.currency} ${contract.amount}", fontSize = 12.sp) } }, onClick = { selectedContract = contract; amount = contract.amount; currency = contract.currency; contractMenuExpanded = false }) }
            }
        }
        Spacer(Modifier.height(12.dp)); OutlinedTextField(amount, { amount = it.filter { char -> char.isDigit() || char == '.' } }, Modifier.fillMaxWidth(), label = { Text("Monto *") }, singleLine = true)
        Spacer(Modifier.height(12.dp)); Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("CRC", "USD").forEach { c -> FilterChip(currency == c, { currency = c }, { Text(c) }) } }
        Spacer(Modifier.height(12.dp)); OutlinedTextField(channel, { channel = it }, Modifier.fillMaxWidth(), label = { Text("Medio de pago *") }, supportingText = { Text("Ejemplo: sinpe, transferencia o efectivo") }, singleLine = true)
        Spacer(Modifier.height(12.dp)); OutlinedTextField(reference, { reference = it }, Modifier.fillMaxWidth(), label = { Text("Referencia") }, singleLine = true)
        Spacer(Modifier.height(12.dp)); Text("Estado *", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("verified" to "Verificado", "unverified" to "Sin verificar", "pending" to "Pendiente", "rejected" to "Rechazado").forEach { (value, label) -> FilterChip(status == value, { status = value }, { Text(label) }) } }
        Spacer(Modifier.height(12.dp)); OutlinedTextField(paidAt, { paidAt = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Fecha de pago *") }, supportingText = { Text("Formato: AAAA-MM-DD") }, singleLine = true)
        if (selectedContract != null && !monthlyCoverage) {
            Spacer(Modifier.height(12.dp)); Text("Este contrato no usa facturación mensual (${selectedContract?.billingCycle?.ifBlank { "—" }}). No se puede indicar cobertura de meses.", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
        }
        if (monthlyCoverage) {
            Spacer(Modifier.height(12.dp)); OutlinedTextField(billingMonth, { billingMonth = it.take(7) }, Modifier.fillMaxWidth(), label = { Text("Primer mes cubierto") }, supportingText = { Text("Formato: AAAA-MM") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(months, { months = it.filter(Char::isDigit).take(2) }, Modifier.fillMaxWidth(), label = { Text("Cantidad de meses") }, supportingText = { Text("Se aplican consecutivamente desde el mes seleccionado") }, singleLine = true)
        }
        Spacer(Modifier.height(12.dp)); OutlinedTextField(graceMonths, { graceMonths = it.filter(Char::isDigit).take(2) }, Modifier.fillMaxWidth(), label = { Text("Meses de cortesía") }, singleLine = true)
        Spacer(Modifier.height(20.dp))
        val valid = selectedClient != null && (amount.toDoubleOrNull() ?: 0.0) > 0 && currency.isNotBlank() && channel.isNotBlank() &&
            Regex("\\d{4}-\\d{2}-\\d{2}").matches(paidAt) &&
            (!monthlyCoverage || (Regex("\\d{4}-\\d{2}").matches(billingMonth) && (months.toIntOrNull() ?: 0) in 1..36)) &&
            (graceMonths.toIntOrNull() ?: -1) in 0..12
        Button(
            onClick = { selectedClient?.let { client -> vm.applyPayment(client.id, selectedContract?.id, amount, currency, channel.trim(), reference.trim(), status, paidAt, billingMonth, months.toIntOrNull() ?: 1, graceMonths.toIntOrNull() ?: 0, back) } },
            modifier = Modifier.fillMaxWidth().height(54.dp), enabled = valid && !state.loading,
        ) { Icon(Icons.Default.Check, null); Spacer(Modifier.width(8.dp)); Text(if (state.loading) "Aplicando…" else "Aplicar pago") }
    } }
}

private fun contractSupportsMonthlyCoverage(contract: ContractItem?): Boolean {
    if (contract == null) return false
    val cycle = contract.billingCycle.trim().lowercase()
    return cycle.isBlank() || cycle == "monthly" || cycle == "mensual"
}
private fun crc(value: Double) = "₡" + String.format(java.util.Locale.US, "%,.2f", value)

@Composable
private fun FinanceAmountCard(title: String, amount: Double, detail: String, modifier: Modifier = Modifier.fillMaxWidth()) =
    Card(modifier, shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(18.dp)) {
            Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(crc(amount), fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 5.dp))
            Text(detail, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

@Composable
private fun ProfileModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var name by remember(state.user) { mutableStateOf(state.user?.name.orEmpty()) }; var email by remember(state.user) { mutableStateOf(state.user?.email.orEmpty()) }
    ModulePage("Perfil", back) { item { OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Nombre") }, singleLine = true); Spacer(Modifier.height(12.dp)); OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Correo") }, singleLine = true); if (!state.user?.phone.isNullOrBlank()) { Spacer(Modifier.height(12.dp)); DetailLine(Icons.Default.Info, "Teléfono", state.user?.phone.orEmpty()) }; Spacer(Modifier.height(18.dp)); Button({ vm.updateProfile(name, email, back) }, Modifier.fillMaxWidth().height(52.dp), enabled = name.isNotBlank() && email.isNotBlank() && !state.loading) { Text("Guardar cambios") } } }
}

@Composable
private fun SettingsModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    val context = LocalContext.current; val activity = context as FragmentActivity; val biometricAvailable = remember { BiometricAuthenticator.isAvailable(context) }
    fun hasPushPermission() = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    var pushPermissionGranted by remember { mutableStateOf(hasPushPermission()) }
    var systemNotificationsEnabled by remember { mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled()) }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pushPermissionGranted = granted
        systemNotificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        vm.setNotificationsEnabled(granted && systemNotificationsEnabled)
        if (granted && systemNotificationsEnabled) vm.syncPushToken()
    }
    LifecycleResumeEffect(Unit) {
        pushPermissionGranted = hasPushPermission()
        systemNotificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        if (state.notificationsEnabled && pushPermissionGranted && systemNotificationsEnabled) vm.syncPushToken()
        onPauseOrDispose { }
    }
    val pushReady = state.notificationsEnabled && pushPermissionGranted && systemNotificationsEnabled && state.pushRegistered == true
    fun openNotificationSettings() {
        context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        })
    }
    ModulePage("Configuración", back) {
        item { SettingToggle("Modo oscuro", "Usar colores cómodos de noche", state.darkMode, vm::setDarkMode) }
        item {
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Notifications, null, tint = if (pushReady) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                            Text("Notificaciones push", fontWeight = FontWeight.SemiBold)
                            Text(if (pushReady) "Permiso concedido y dispositivo listo" else "Requiere atención", fontSize = 12.sp, color = if (pushReady) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                        }
                        Switch(state.notificationsEnabled, { enabled ->
                            if (!enabled) vm.setNotificationsEnabled(false)
                            else if (!hasPushPermission() && Build.VERSION.SDK_INT >= 33) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                            else if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) openNotificationSettings()
                            else { vm.setNotificationsEnabled(true); vm.syncPushToken() }
                        })
                    }
                    HorizontalDivider(Modifier.padding(vertical = 12.dp))
                    NotificationStatusLine("Permiso de Android", pushPermissionGranted)
                    NotificationStatusLine("Notificaciones del sistema", systemNotificationsEnabled)
                    NotificationStatusLine("Preferencia de la app", state.notificationsEnabled)
                    NotificationStatusLine("Dispositivo registrado", state.pushRegistered == true)
                    if (!pushPermissionGranted || !systemNotificationsEnabled) {
                        OutlinedButton(::openNotificationSettings, Modifier.fillMaxWidth().padding(top = 12.dp)) { Icon(Icons.Default.Settings, null); Spacer(Modifier.width(8.dp)); Text("Abrir ajustes de notificaciones") }
                    }
                }
            }
        }
        item { SettingToggle("Huella o biometría", if (biometricAvailable) "Proteger el acceso a la app" else "Configurá una huella en Android primero", state.biometricEnabled, { enabled -> if (!enabled) vm.setBiometricEnabled(false) else BiometricAuthenticator.authenticate(activity, { vm.setBiometricEnabled(true) }, {}) }, biometricAvailable) }
    }
}

@Composable
private fun NotificationStatusLine(label: String, enabled: Boolean) = Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
    Icon(if (enabled) Icons.Default.CheckCircle else Icons.Default.Warning, null, Modifier.size(18.dp), tint = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
    Text(label, Modifier.weight(1f).padding(start = 9.dp), fontSize = 13.sp)
    Text(if (enabled) "Activo" else "Inactivo", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun SystemSettingsModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    val current = state.systemSettings
    if (current == null) {
        ModulePage("Configuración del sistema", back) { item { EmptyState("No se pudo cargar la configuración") } }
        return
    }
    var companyName by remember(current) { mutableStateOf(current.companyName) }
    var serviceName by remember(current) { mutableStateOf(current.serviceName) }
    var paymentContact by remember(current) { mutableStateOf(current.paymentContact) }
    var beneficiaryName by remember(current) { mutableStateOf(current.beneficiaryName) }
    var bankAccounts by remember(current) { mutableStateOf(current.bankAccounts) }
    var reminderTemplate by remember(current) { mutableStateOf(current.reminderTemplate) }
    ModulePage("Configuración del sistema", back) {
        item {
            Text("Información general", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(companyName, { companyName = it }, Modifier.fillMaxWidth(), label = { Text("Nombre de la empresa") }, singleLine = true)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(serviceName, { serviceName = it }, Modifier.fillMaxWidth(), label = { Text("Nombre del servicio") }, singleLine = true)
        }
        item {
            Text("Datos para pagos", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(paymentContact, { paymentContact = it }, Modifier.fillMaxWidth(), label = { Text("Número SINPE") }, singleLine = true)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(beneficiaryName, { beneficiaryName = it }, Modifier.fillMaxWidth(), label = { Text("Nombre del beneficiario") }, singleLine = true)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(bankAccounts, { bankAccounts = it }, Modifier.fillMaxWidth(), label = { Text("Cuentas bancarias") }, supportingText = { Text("Una cuenta por línea") }, minLines = 4, maxLines = 8)
        }
        item {
            Text("Recordatorios", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(reminderTemplate, { reminderTemplate = it }, Modifier.fillMaxWidth(), label = { Text("Plantilla de recordatorio") }, minLines = 5, maxLines = 10)
        }
        item {
            Button({ vm.updateSystemSettings(SystemSettings(companyName, serviceName, paymentContact, beneficiaryName, bankAccounts, reminderTemplate), back) }, Modifier.fillMaxWidth().height(54.dp), enabled = !state.loading) {
                Icon(Icons.Default.Settings, null); Spacer(Modifier.width(8.dp)); Text("Guardar configuración")
            }
            Text("Las cuentas y el SINPE se actualizarán también en la respuesta rápida de pagos.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

@Composable
private fun UsersModule(users: List<UserItem>, updateRole: (UserItem, String) -> Unit, back: () -> Unit) = ModulePage("Usuarios", back) { items(users) { user -> Card(Modifier.fillMaxWidth()) { Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(user.name, Icons.Default.Person); Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(user.name, fontWeight = FontWeight.Bold); Text(user.email, color = MaterialTheme.colorScheme.onSurfaceVariant) }; AssistChip({ updateRole(user, if (user.role == "admin") "agent" else "admin") }, { Text(if (user.role == "admin") "Admin" else "Agente") }) } } } }

@Composable
private fun ModulePage(title: String, back: () -> Unit, content: LazyListScope.() -> Unit) = LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { item { TextButton(back) { Icon(Icons.Default.ArrowBack, null); Text("Volver") }; Text(title, fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(8.dp)) }; content() }

@Composable
private fun SettingToggle(title: String, subtitle: String, checked: Boolean, onChecked: (Boolean) -> Unit, enabled: Boolean = true) = Card(Modifier.fillMaxWidth()) { Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Settings, null, tint = MaterialTheme.colorScheme.primary); Column(Modifier.weight(1f).padding(start = 14.dp)) { Text(title, fontWeight = FontWeight.SemiBold); Text(subtitle, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }; Switch(checked, onChecked, enabled = enabled) } }

@Composable private fun EmptyState(text: String) = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(text, color = Color.Gray) }
@Composable private fun ErrorBanner(text: String, close: () -> Unit, modifier: Modifier = Modifier) = Surface(modifier.padding(12.dp), color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(14.dp)) { Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Text(text, Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer); IconButton(close) { Icon(Icons.Default.Close, "Cerrar") } } }
@Composable private fun NoticeBanner(text: String, close: () -> Unit, modifier: Modifier = Modifier) = Surface(modifier.padding(12.dp), color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(14.dp)) { Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.CheckCircle, null, tint = MaterialTheme.colorScheme.primary); Spacer(Modifier.width(10.dp)); Text(text, Modifier.weight(1f), color = MaterialTheme.colorScheme.onPrimaryContainer); IconButton(close) { Icon(Icons.Default.Close, "Cerrar") } } }
